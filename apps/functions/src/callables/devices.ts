
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { approveDeviceSchema, deviceLeaseSchema, registerDeviceSchema } from "@school-nfc/contracts";
import { db } from "../admin.js";
import { requireMembership, requireUser } from "../lib/authz.js";
import { writeAudit } from "../lib/audit.js";
import { randomToken } from "../lib/crypto.js";
import { callableOptions } from "../lib/options.js";
import { parseInput } from "../lib/parse.js";

export const registerDevice = onCall(callableOptions, async (request) => {
  const input = parseInput(registerDeviceSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "device.read");
  const ref = db.doc(`schools/${input.schoolId}/devices/${input.devicePublicId}`);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.assignedUserId !== actor.uid) throw new HttpsError("already-exists", "This device identifier is already registered.");
  await ref.set({
    devicePublicId: input.devicePublicId, displayName: input.displayName, platform: input.platform, appVersion: input.appVersion,
    androidVersion: input.androidVersion, manufacturer: input.manufacturer, model: input.model, status: snap.data()?.status ?? "PENDING",
    assignedUserId: actor.uid, requestedSectionIds: actor.sectionIds ?? [], allowedSectionIds: snap.data()?.allowedSectionIds ?? [],
    createdAt: snap.exists ? snap.data()?.createdAt : FieldValue.serverTimestamp(), createdBy: actor.uid,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid, lastSeenAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { deviceId: ref.id, status: snap.data()?.status ?? "PENDING" };
});

export const approveDevice = onCall(callableOptions, async (request) => {
  const input = parseInput(approveDeviceSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "device.approve");
  const ref = db.doc(`schools/${input.schoolId}/devices/${input.deviceId}`);
  await db.runTransaction(async (tx) => {
    const deviceSnap = await tx.get(ref);
    if (!deviceSnap.exists) throw new HttpsError("not-found", "Device was not found.");
    const ownerId = deviceSnap.data()?.assignedUserId;
    if (typeof ownerId !== "string") throw new HttpsError("failed-precondition", "Device owner is missing.");
    const ownerRef = db.doc(`schools/${input.schoolId}/members/${ownerId}`);
    const ownerSnap = await tx.get(ownerRef);
    if (!ownerSnap.exists || ownerSnap.data()?.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Device owner is not an active school member.");
    const ownerRole = ownerSnap.data()?.role;
    const ownerSections: string[] = ownerSnap.data()?.sectionIds ?? [];
    const schoolWideRole = ["SCHOOL_ADMIN", "REGISTRAR", "ATTENDANCE_OFFICER"].includes(ownerRole);
    if (!schoolWideRole && input.allowedSectionIds.length === 0) throw new HttpsError("invalid-argument", "A scoped staff device must have at least one allowed section.");
    if (!schoolWideRole && input.allowedSectionIds.some((id) => !ownerSections.includes(id))) {
      throw new HttpsError("permission-denied", "Device scope cannot exceed the owner's assigned sections.");
    }
    if (actor.role !== "SCHOOL_ADMIN" && input.allowedSectionIds.some((id) => !actor.sectionIds.includes(id))) {
      throw new HttpsError("permission-denied", "Device scope cannot exceed the approver's assigned sections.");
    }
    tx.update(ref, {
      status: "APPROVED", allowedSectionIds: input.allowedSectionIds, leaseHours: input.leaseHours,
      approvedAt: FieldValue.serverTimestamp(), approvedBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    });
    writeAudit(tx, {
      schoolId: input.schoolId, eventType: "DEVICE_APPROVED", actorUserId: actor.uid, targetType: "DEVICE", targetId: input.deviceId,
      before: { status: deviceSnap.data()?.status }, after: { status: "APPROVED", allowedSectionIds: input.allowedSectionIds },
    });
  });
  return { deviceId: input.deviceId, status: "APPROVED" };
});

export const renewDeviceLease = onCall(callableOptions, async (request) => {
  const input = parseInput(deviceLeaseSchema, request.data);
  const user = requireUser(request);
  const member = await requireMembership(request, input.schoolId, "scanner.start");
  const deviceRef = db.doc(`schools/${input.schoolId}/devices/${input.deviceId}`);
  const leaseRef = db.collection(`schools/${input.schoolId}/deviceLeases`).doc(randomToken(18));
  const lease = await db.runTransaction(async (tx) => {
    const deviceSnap = await tx.get(deviceRef);
    if (!deviceSnap.exists || deviceSnap.data()?.status !== "APPROVED") throw new HttpsError("permission-denied", "Device is not approved.");
    if (deviceSnap.data()?.assignedUserId !== user.uid) throw new HttpsError("permission-denied", "Device belongs to another user.");
    const schoolWideRole = ["SCHOOL_ADMIN", "REGISTRAR", "ATTENDANCE_OFFICER"].includes(member.role);
    const approved: string[] = deviceSnap.data()?.allowedSectionIds ?? [];
    const sectionIds = schoolWideRole ? approved : approved.filter((id) => member.sectionIds.includes(id));
    if (!schoolWideRole && sectionIds.length === 0) throw new HttpsError("failed-precondition", "Device no longer has an allowed section. Ask an administrator to review its scope.");
    const hours = Math.min(Number(deviceSnap.data()?.leaseHours ?? 24), 168);
    const expiresAt = Timestamp.fromMillis(Date.now() + hours * 60 * 60 * 1000);
    tx.create(leaseRef, {
      deviceId: input.deviceId, userId: user.uid, schoolId: input.schoolId, memberRole: member.role,
      sectionIds, status: "ACTIVE", issuedAt: FieldValue.serverTimestamp(), expiresAt,
    });
    tx.update(deviceRef, { currentLeaseId: leaseRef.id, allowedSectionIds: sectionIds, lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { leaseId: leaseRef.id, expiresAt: expiresAt.toDate().toISOString(), sectionIds };
  });
  return lease;
});

const deviceActionSchema = deviceLeaseSchema.pick({ schoolId: true, deviceId: true }).extend({ reason: deviceLeaseSchema.shape.deviceId.transform(() => "").optional() });

export const revokeDevice = onCall(callableOptions, async (request) => {
  const input = request.data as { schoolId?: string; deviceId?: string; reason?: string };
  if (!input.schoolId || !input.deviceId || !input.reason || input.reason.trim().length < 5) throw new HttpsError("invalid-argument", "School, device, and reason are required.");
  const actor = await requireMembership(request, input.schoolId, "device.revoke");
  const ref = db.doc(`schools/${input.schoolId}/devices/${input.deviceId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Device was not found.");
    tx.update(ref, { status: "REVOKED", revokedAt: FieldValue.serverTimestamp(), revokedBy: actor.uid, revocationReason: input.reason.trim(), updatedAt: FieldValue.serverTimestamp() });
    const leaseId = snap.data()?.currentLeaseId;
    if (leaseId) tx.set(db.doc(`schools/${input.schoolId}/deviceLeases/${leaseId}`), { status: "REVOKED", revokedAt: FieldValue.serverTimestamp() }, { merge: true });
    writeAudit(tx, { schoolId: input.schoolId, eventType: "DEVICE_REVOKED", actorUserId: actor.uid, targetType: "DEVICE", targetId: input.deviceId, reason: input.reason.trim(), before: { status: snap.data()?.status }, after: { status: "REVOKED" } });
  });
  return { deviceId: input.deviceId, status: "REVOKED" };
});
