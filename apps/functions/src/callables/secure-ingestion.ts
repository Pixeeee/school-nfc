import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

const app = getApps()[0] ?? initializeApp();
const db = getFirestore(app);

const callableOptions = {
  region: "asia-southeast1",
  enforceAppCheck: true,
  consumeAppCheckToken: true,
  timeoutSeconds: 120,
  memory: "512MiB" as const,
};

const attendanceEventSchema = z
  .object({
    eventUuid: z.string().uuid(),
    idempotencyKey: z.string().min(16).max(256),
    studentId: z.string().min(4).max(128),
    cardId: z.string().min(4).max(128),
    eventType: z.enum(["ARRIVAL", "DISMISSAL", "CUSTOM"]),
    localSchoolDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localTimestamp: z.string().datetime({ offset: true }),
    timezone: z.string().min(1).max(64),
    clockTrust: z.string().min(1).max(32).default("UNKNOWN"),
    scannerSessionId: z.string().min(1).max(128).optional(),
    source: z.string().min(1).max(32).default("NFC"),
    status: z.string().min(1).max(32).optional(),
  })
  .passthrough();

const attendanceBatchSchema = z
  .object({
    schoolId: z.string().min(4).max(128),
    deviceId: z.string().min(4).max(128),
    leaseId: z.string().min(4).max(128),
    batchId: z.string().min(4).max(128),
    events: z.array(attendanceEventSchema).min(1).max(100),
  })
  .passthrough();

const smsResultSchema = z
  .object({
    messageId: z.string().min(4).max(128),
    attendanceEventId: z.string().min(4).max(128),
    guardianId: z.string().min(4).max(128),
    idempotencyKey: z.string().min(8).max(256).optional(),
    status: z.enum([
      "PENDING",
      "READY",
      "SENDING",
      "SENT",
      "DELIVERED",
      "FAILED_RETRYABLE",
      "FAILED_FINAL",
      "CANCELLED",
    ]),
    attemptCount: z.number().int().min(0).max(100),
    renderedMessage: z.string().min(1).max(1000).optional(),
    sentAt: z.string().datetime({ offset: true }).nullable().optional(),
    deliveredAt: z.string().datetime({ offset: true }).nullable().optional(),
    lastErrorCode: z.string().max(100).nullable().optional(),
    lastErrorMessage: z.string().max(500).nullable().optional(),
    subscriptionFingerprint: z.string().max(256).nullable().optional(),
  })
  .passthrough();

const smsBatchSchema = z
  .object({
    schoolId: z.string().min(4).max(128),
    deviceId: z.string().min(4).max(128),
    leaseId: z.string().min(4).max(128),
    batchId: z.string().min(4).max(128).optional(),
    messages: z.array(smsResultSchema).min(1).max(100),
  })
  .passthrough();

const correctionSchema = z
  .object({
    schoolId: z.string().min(4).max(128),
    attendanceEventId: z.string().min(4).max(128),
    correctedStatus: z.enum([
      "PRESENT",
      "LATE",
      "DISMISSED",
      "ABSENT",
      "EXCUSED",
      "VOIDED",
    ]),
    reason: z.string().trim().min(5).max(500),
  })
  .passthrough();

const EVENT_PERMISSION: Record<string, string> = {
  ARRIVAL: "scanner.arrival",
  DISMISSAL: "scanner.dismissal",
  CUSTOM: "scanner.custom",
};

const PRIVILEGED_ROLES = new Set([
  "PLATFORM_SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "REGISTRAR",
  "ATTENDANCE_OFFICER",
]);

const SMS_STATUS_RANK: Record<string, number> = {
  PENDING: 0,
  READY: 1,
  SENDING: 2,
  SENT: 3,
  DELIVERED: 4,
  FAILED_RETRYABLE: 2,
  FAILED_FINAL: 5,
  CANCELLED: 5,
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Request validation failed.", {
      issues: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

function requireAuth(request: { auth?: { uid: string } | null }): string {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }
  return request.auth.uid;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function dateFromUnknown(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      const date = toDate.call(value);
      return date instanceof Date ? date : null;
    }
  }
  return null;
}

function canonicalAttendanceKey(
  schoolId: string,
  studentId: string,
  localSchoolDate: string,
  eventType: string,
): string {
  return `${schoolId}|${studentId}|${localSchoolDate}|${eventType}`;
}

function keyMatches(supplied: string, canonical: string): boolean {
  return supplied === canonical || supplied === sha256(canonical);
}

function assertTimeWindow(
  localTimestamp: string,
  localSchoolDate: string,
  timezone: string,
  clockTrust: string,
): void {
  const value = Date.parse(localTimestamp);
  if (!Number.isFinite(value)) {
    throw new HttpsError("invalid-argument", "Invalid local timestamp.");
  }
  const now = Date.now();
  if (value > now + 15 * 60_000 || value < now - 45 * 24 * 60 * 60_000) {
    throw new HttpsError("failed-precondition", "Attendance timestamp is outside the accepted window.");
  }

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const derivedDate = `${map.year}-${map.month}-${map.day}`;
    if (clockTrust === "TRUSTED" && derivedDate !== localSchoolDate) {
      throw new HttpsError(
        "failed-precondition",
        "Local school date does not match the trusted timestamp and timezone.",
      );
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("invalid-argument", "Invalid IANA timezone.");
  }
}

function isPrivileged(role: unknown): boolean {
  return typeof role === "string" && PRIVILEGED_ROLES.has(role);
}

function assertPermission(member: DocumentSnapshot, permission: string): void {
  if (!member.exists || member.get("status") !== "ACTIVE") {
    throw new HttpsError("permission-denied", "Active school membership is required.");
  }
  if (!strings(member.get("permissions")).includes(permission)) {
    throw new HttpsError("permission-denied", `Missing permission: ${permission}`);
  }
}

function assertSectionScope(
  member: DocumentSnapshot,
  device: DocumentSnapshot,
  sectionId: string,
): void {
  if (isPrivileged(member.get("role"))) return;
  const memberSections = new Set(strings(member.get("allowedSectionIds")));
  const deviceSections = new Set(strings(device.get("allowedSectionIds")));
  if (!memberSections.has(sectionId) || !deviceSections.has(sectionId)) {
    throw new HttpsError("permission-denied", "Student section is outside the authorized scope.");
  }
}

function assertDeviceAndLease(
  uid: string,
  deviceId: string,
  device: DocumentSnapshot,
  lease: DocumentSnapshot,
): void {
  if (!device.exists || device.get("status") !== "APPROVED") {
    throw new HttpsError("permission-denied", "Approved device is required.");
  }
  const owner = device.get("ownerUid") ?? device.get("registeredByUid") ?? device.get("registeredBy") ?? device.get("userId");
  if (owner !== uid) {
    throw new HttpsError("permission-denied", "Device does not belong to the authenticated user.");
  }
  if (!lease.exists || !["ACTIVE", "APPROVED", "VALID"].includes(String(lease.get("status")))) {
    throw new HttpsError("permission-denied", "An active device lease is required.");
  }
  if (lease.get("deviceId") !== deviceId) {
    throw new HttpsError("permission-denied", "Device lease does not match the device.");
  }
  const leaseUid = lease.get("uid") ?? lease.get("userId") ?? lease.get("ownerUid");
  if (leaseUid && leaseUid !== uid) {
    throw new HttpsError("permission-denied", "Device lease does not belong to the authenticated user.");
  }
  const expiresAt = dateFromUnknown(lease.get("expiresAt"));
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    throw new HttpsError("permission-denied", "Device lease has expired.");
  }
}

function effectiveAttendanceStatus(eventType: string, supplied?: string): string {
  if (supplied && ["PRESENT", "LATE", "DISMISSED"].includes(supplied)) return supplied;
  return eventType === "DISMISSAL" ? "DISMISSED" : "PRESENT";
}

function attendanceReferences(schoolId: string, input: {
  deviceId: string;
  leaseId: string;
  studentId: string;
  cardId: string;
  eventId: string;
  eventUuid: string;
  dailyId: string;
  uid: string;
}) {
  return {
    member: db.doc(`schools/${schoolId}/members/${input.uid}`),
    device: db.doc(`schools/${schoolId}/devices/${input.deviceId}`),
    lease: db.doc(`schools/${schoolId}/deviceLeases/${input.leaseId}`),
    student: db.doc(`schools/${schoolId}/students/${input.studentId}`),
    card: db.doc(`schools/${schoolId}/nfcCards/${input.cardId}`),
    event: db.doc(`schools/${schoolId}/attendanceEvents/${input.eventId}`),
    eventUuid: db.doc(`schools/${schoolId}/attendanceEventUuids/${sha256(input.eventUuid)}`),
    daily: db.doc(`schools/${schoolId}/attendanceDays/${input.dailyId}`),
    audit: db.collection(`schools/${schoolId}/auditLogs`).doc(),
  };
}

export const ingestAttendanceBatch = onCall(callableOptions, async (request) => {
  const uid = requireAuth(request);
  const input = parseOrThrow(attendanceBatchSchema, request.data);
  const results: Array<Record<string, unknown>> = [];

  for (const event of input.events) {
    try {
      const requiredPermission = EVENT_PERMISSION[event.eventType];
      if (!requiredPermission) {
        throw new HttpsError("invalid-argument", "Unsupported attendance event type.");
      }
      const canonicalKey = canonicalAttendanceKey(
        input.schoolId,
        event.studentId,
        event.localSchoolDate,
        event.eventType,
      );
      if (!keyMatches(event.idempotencyKey, canonicalKey)) {
        throw new HttpsError("invalid-argument", "Attendance idempotency key does not match server data.");
      }
      assertTimeWindow(
        event.localTimestamp,
        event.localSchoolDate,
        event.timezone,
        event.clockTrust,
      );

      const eventId = sha256(canonicalKey);
      const dailyId = sha256(`${input.schoolId}|${event.studentId}|${event.localSchoolDate}`);
      const refs = attendanceReferences(input.schoolId, {
        deviceId: input.deviceId,
        leaseId: input.leaseId,
        studentId: event.studentId,
        cardId: event.cardId,
        eventId,
        eventUuid: event.eventUuid,
        dailyId,
        uid,
      });

      const transactionResult = await db.runTransaction(async (transaction) => {
        const [member, device, lease, student, card, existingEvent, existingUuid, daily] = await transaction.getAll(
          refs.member,
          refs.device,
          refs.lease,
          refs.student,
          refs.card,
          refs.event,
          refs.eventUuid,
          refs.daily,
        );

        assertPermission(member, requiredPermission);
        assertDeviceAndLease(uid, input.deviceId, device, lease);

        if (!student.exists || student.get("status") !== "ACTIVE") {
          throw new HttpsError("failed-precondition", "Student is not active.");
        }
        if (!card.exists || card.get("status") !== "ACTIVE") {
          throw new HttpsError("failed-precondition", "NFC card is not active.");
        }
        if (card.get("studentId") !== event.studentId) {
          throw new HttpsError("failed-precondition", "NFC card is not assigned to this student.");
        }
        const sectionId = student.get("sectionId");
        if (typeof sectionId !== "string" || sectionId.length === 0) {
          throw new HttpsError("failed-precondition", "Student has no active section.");
        }
        if (typeof card.get("sectionId") === "string" && card.get("sectionId") !== sectionId) {
          throw new HttpsError("failed-precondition", "Card/student section mismatch.");
        }
        assertSectionScope(member, device, sectionId);

        if (existingUuid.exists && existingUuid.get("eventId") !== eventId) {
          throw new HttpsError(
            "already-exists",
            "The event UUID was already used for a different attendance event.",
          );
        }
        if (existingEvent.exists) {
          return { result: "ALREADY_EXISTS", eventId, sectionId };
        }

        const status = effectiveAttendanceStatus(event.eventType, event.status);
        const eventRecord = {
          eventId,
          eventUuid: event.eventUuid,
          idempotencyKey: canonicalKey,
          schoolId: input.schoolId,
          studentId: event.studentId,
          cardId: event.cardId,
          sectionId,
          eventType: event.eventType,
          localSchoolDate: event.localSchoolDate,
          localTimestamp: event.localTimestamp,
          timezone: event.timezone,
          clockTrust: event.clockTrust,
          deviceId: input.deviceId,
          teacherId: uid,
          scannerSessionId: event.scannerSessionId ?? null,
          source: event.source,
          status,
          batchId: input.batchId,
          cloudReceivedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        };
        transaction.create(refs.event, eventRecord);
        if (!existingUuid.exists) {
          transaction.create(refs.eventUuid, {
            eventUuid: event.eventUuid,
            eventId,
            studentId: event.studentId,
            localSchoolDate: event.localSchoolDate,
            eventType: event.eventType,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        const dailyData: Record<string, unknown> = {
          schoolId: input.schoolId,
          studentId: event.studentId,
          sectionId,
          localSchoolDate: event.localSchoolDate,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (event.eventType === "ARRIVAL") {
          dailyData.arrivalEventId = eventId;
          dailyData.arrivalTime = event.localTimestamp;
          dailyData.status = status;
        } else if (event.eventType === "DISMISSAL") {
          dailyData.dismissalEventId = eventId;
          dailyData.dismissalTime = event.localTimestamp;
          dailyData.dismissalStatus = status;
        } else {
          dailyData.lastCustomEventId = eventId;
          dailyData.lastCustomEventTime = event.localTimestamp;
        }
        if (daily.exists) transaction.set(refs.daily, dailyData, { merge: true });
        else transaction.create(refs.daily, { ...dailyData, createdAt: FieldValue.serverTimestamp() });

        transaction.update(refs.card, {
          lastUsedAt: FieldValue.serverTimestamp(),
          lastUsedDeviceId: input.deviceId,
        });
        transaction.update(refs.device, {
          lastSeenAt: FieldValue.serverTimestamp(),
        });
        transaction.create(refs.audit, {
          type: "ATTENDANCE_ACCEPTED",
          actorUid: uid,
          deviceId: input.deviceId,
          targetType: "attendanceEvent",
          targetId: eventId,
          studentId: event.studentId,
          sectionId,
          eventType: event.eventType,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { result: "ACCEPTED", eventId, sectionId };
      });

      results.push({ localEventUuid: event.eventUuid, ...transactionResult });
    } catch (error) {
      if (error instanceof HttpsError) {
        results.push({
          localEventUuid: event.eventUuid,
          result: error.code === "already-exists" ? "ALREADY_EXISTS" : "REJECTED",
          errorCode: error.code,
          errorMessage: error.message,
        });
        continue;
      }
      throw error;
    }
  }

  return { batchId: input.batchId, results };
});

async function findAttendanceRef(
  schoolId: string,
  reference: string,
): Promise<DocumentReference<DocumentData>> {
  const collection = db.collection(`schools/${schoolId}/attendanceEvents`);
  const direct = await collection.doc(reference).get();
  if (direct.exists) return direct.ref;
  const byUuid = await collection.where("eventUuid", "==", reference).limit(1).get();
  const document = byUuid.docs.at(0);
  if (!document) throw new HttpsError("not-found", "Attendance event was not found.");
  return document.ref;
}

function assertSmsTransition(previous: unknown, next: string): void {
  if (typeof previous !== "string" || !(previous in SMS_STATUS_RANK)) return;
  const previousRank = SMS_STATUS_RANK[previous];
  const nextRank = SMS_STATUS_RANK[next];
  if (nextRank === undefined || previousRank === undefined) {
    throw new HttpsError("invalid-argument", "Unsupported SMS status.");
  }
  const allowedRetry = previous === "FAILED_RETRYABLE"
    && ["READY", "SENDING", "SENT", "DELIVERED", "FAILED_FINAL"].includes(next);
  if (!allowedRetry && nextRank < previousRank) {
    throw new HttpsError("failed-precondition", "SMS status cannot move backwards.");
  }
  if (["DELIVERED", "FAILED_FINAL", "CANCELLED"].includes(previous) && next !== previous) {
    throw new HttpsError("failed-precondition", "Final SMS status cannot be changed.");
  }
}

export const ingestSmsResults = onCall(callableOptions, async (request) => {
  const uid = requireAuth(request);
  const input = parseOrThrow(smsBatchSchema, request.data);
  const results: Array<Record<string, unknown>> = [];

  for (const message of input.messages) {
    try {
      const attendanceRef = await findAttendanceRef(input.schoolId, message.attendanceEventId);
      const attendancePreview = await attendanceRef.get();
      const previewStudentId = attendancePreview.get("studentId");
      if (typeof previewStudentId !== "string" || previewStudentId.length === 0) {
        throw new HttpsError("failed-precondition", "Attendance event has no student reference.");
      }
      const linksQuery = await db
        .collection(`schools/${input.schoolId}/studentGuardianLinks`)
        .where("studentId", "==", previewStudentId)
        .where("guardianId", "==", message.guardianId)
        .limit(1)
        .get();
      const candidateLinkRefs = linksQuery.docs.map((document) => document.ref);
      if (candidateLinkRefs.length === 0) {
        throw new HttpsError("permission-denied", "Guardian is not linked to this student.");
      }

      const messageDocId = sha256(`${attendanceRef.id}|${message.guardianId}`);
      const refs = {
        member: db.doc(`schools/${input.schoolId}/members/${uid}`),
        device: db.doc(`schools/${input.schoolId}/devices/${input.deviceId}`),
        lease: db.doc(`schools/${input.schoolId}/deviceLeases/${input.leaseId}`),
        guardian: db.doc(`schools/${input.schoolId}/guardians/${message.guardianId}`),
        message: db.doc(`schools/${input.schoolId}/smsMessages/${messageDocId}`),
        audit: db.collection(`schools/${input.schoolId}/auditLogs`).doc(),
      };

      await db.runTransaction(async (transaction) => {
        const [member, device, lease, attendance, guardian, existingMessage, ...links] = await transaction.getAll(
          refs.member,
          refs.device,
          refs.lease,
          attendanceRef,
          refs.guardian,
          refs.message,
          ...candidateLinkRefs,
        );
        assertDeviceAndLease(uid, input.deviceId, device, lease);
        if (!member.exists || member.get("status") !== "ACTIVE") {
          throw new HttpsError("permission-denied", "Active school membership is required.");
        }
        if (!attendance.exists) {
          throw new HttpsError("not-found", "Attendance event was not found.");
        }
        if (attendance.get("deviceId") !== input.deviceId) {
          throw new HttpsError("permission-denied", "Attendance event belongs to another device.");
        }
        if (attendance.get("teacherId") !== uid && !isPrivileged(member.get("role"))) {
          throw new HttpsError("permission-denied", "Attendance event belongs to another teacher.");
        }
        const sectionId = attendance.get("sectionId");
        if (typeof sectionId !== "string") {
          throw new HttpsError("failed-precondition", "Attendance event has no section scope.");
        }
        assertSectionScope(member, device, sectionId);
        if (
          !guardian.exists
          || guardian.get("status") === "DISABLED"
          || guardian.get("phoneStatus") !== "VERIFIED"
          || guardian.get("consentStatus") !== "RECORDED"
        ) {
          throw new HttpsError("failed-precondition", "Guardian is not eligible for SMS notification.");
        }

        const studentId = attendance.get("studentId");
        const eventType = attendance.get("eventType");
        const validLink = links.find((link) =>
          link.exists
          && link.get("studentId") === studentId
          && link.get("guardianId") === message.guardianId
          && !["DISABLED", "INACTIVE"].includes(String(link.get("status")))
        );
        if (!validLink) {
          throw new HttpsError("permission-denied", "Guardian is not linked to the attendance student.");
        }
        const preferenceField = eventType === "ARRIVAL"
          ? "receiveArrivalSms"
          : eventType === "DISMISSAL"
            ? "receiveDismissalSms"
            : "receiveCustomSms";
        if (validLink.get(preferenceField) === false) {
          throw new HttpsError("failed-precondition", "Guardian disabled this notification type.");
        }

        assertSmsTransition(existingMessage.exists ? existingMessage.get("status") : undefined, message.status);
        const payload = {
          messageId: messageDocId,
          localMessageId: message.messageId,
          schoolId: input.schoolId,
          attendanceEventId: attendanceRef.id,
          studentId,
          guardianId: message.guardianId,
          sectionId,
          phoneMasked: guardian.get("phoneMasked") ?? null,
          renderedMessage: message.renderedMessage ?? existingMessage.get("renderedMessage") ?? null,
          deviceId: input.deviceId,
          teacherId: uid,
          subscriptionFingerprint: message.subscriptionFingerprint ?? null,
          status: message.status,
          attemptCount: message.attemptCount,
          sentAt: message.sentAt ? Timestamp.fromDate(new Date(message.sentAt)) : null,
          deliveredAt: message.deliveredAt ? Timestamp.fromDate(new Date(message.deliveredAt)) : null,
          lastErrorCode: message.lastErrorCode ?? null,
          lastErrorMessage: message.lastErrorMessage ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (existingMessage.exists) transaction.set(refs.message, payload, { merge: true });
        else transaction.create(refs.message, { ...payload, createdAt: FieldValue.serverTimestamp() });
        transaction.create(refs.audit, {
          type: `SMS_${message.status}`,
          actorUid: uid,
          deviceId: input.deviceId,
          targetType: "smsMessage",
          targetId: messageDocId,
          attendanceEventId: attendanceRef.id,
          studentId,
          guardianId: message.guardianId,
          sectionId,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      results.push({ messageId: message.messageId, result: "ACCEPTED", serverMessageId: messageDocId });
    } catch (error) {
      if (error instanceof HttpsError) {
        results.push({
          messageId: message.messageId,
          result: "REJECTED",
          errorCode: error.code,
          errorMessage: error.message,
        });
        continue;
      }
      throw error;
    }
  }

  return { batchId: input.batchId ?? null, results };
});

// Backwards-compatible callable export used by early mobile builds.
export const ingestSmsResultBatch = ingestSmsResults;

export const correctAttendance = onCall(callableOptions, async (request) => {
  const uid = requireAuth(request);
  const input = parseOrThrow(correctionSchema, request.data);
  const eventRef = await findAttendanceRef(input.schoolId, input.attendanceEventId);
  const correctionRef = db.collection(`schools/${input.schoolId}/attendanceCorrections`).doc();
  const auditRef = db.collection(`schools/${input.schoolId}/auditLogs`).doc();

  await db.runTransaction(async (transaction) => {
    const memberRef = db.doc(`schools/${input.schoolId}/members/${uid}`);
    const [member, event] = await transaction.getAll(memberRef, eventRef);
    assertPermission(member, "attendance.correct");
    if (!event.exists) throw new HttpsError("not-found", "Attendance event was not found.");
    const sectionId = event.get("sectionId");
    if (typeof sectionId !== "string") {
      throw new HttpsError("failed-precondition", "Attendance event has no section scope.");
    }
    if (!isPrivileged(member.get("role"))) {
      const allowed = new Set(strings(member.get("allowedSectionIds")));
      if (!allowed.has(sectionId)) {
        throw new HttpsError("permission-denied", "Attendance event is outside your section scope.");
      }
    }

    const dailyId = sha256(`${input.schoolId}|${event.get("studentId")}|${event.get("localSchoolDate")}`);
    const dailyRef = db.doc(`schools/${input.schoolId}/attendanceDays/${dailyId}`);
    const daily = await transaction.get(dailyRef);
    const previousEffectiveStatus = daily.exists
      ? daily.get("effectiveStatus") ?? daily.get("status") ?? null
      : event.get("status") ?? null;

    transaction.create(correctionRef, {
      correctionId: correctionRef.id,
      attendanceEventId: eventRef.id,
      studentId: event.get("studentId"),
      sectionId,
      localSchoolDate: event.get("localSchoolDate"),
      previousEffectiveStatus,
      correctedStatus: input.correctedStatus,
      reason: input.reason,
      correctedBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(dailyRef, {
      schoolId: input.schoolId,
      studentId: event.get("studentId"),
      sectionId,
      localSchoolDate: event.get("localSchoolDate"),
      effectiveStatus: input.correctedStatus,
      latestCorrectionId: correctionRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(eventRef, {
      hasCorrection: true,
      latestCorrectionId: correctionRef.id,
      effectiveStatus: input.correctedStatus,
      correctedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.create(auditRef, {
      type: "ATTENDANCE_CORRECTED",
      actorUid: uid,
      targetType: "attendanceEvent",
      targetId: eventRef.id,
      studentId: event.get("studentId"),
      sectionId,
      before: { effectiveStatus: previousEffectiveStatus },
      after: { effectiveStatus: input.correctedStatus },
      reason: input.reason,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, correctionId: correctionRef.id };
});
