import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import {
  createStudentSchema,
  deviceLeaseSchema,
  idSchema,
  maskPhone,
  personNameSchema,
  philippineMobileSchema,
} from "@school-nfc/contracts";
import { db } from "../admin.js";
import {
  assertSectionScope,
  requireDeviceLease,
  requireMembership,
} from "../lib/authz.js";
import { writeAudit } from "../lib/audit.js";
import { callableOptions } from "../lib/options.js";
import { parseInput } from "../lib/parse.js";

const setupSchema = deviceLeaseSchema.extend({ leaseId: idSchema });
const sectionSchema = setupSchema.extend({
  requestId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  gradeLevelId: idSchema,
  academicYearId: idSchema,
});
const studentSchema = setupSchema.extend({
  requestId: z.string().uuid(),
  sectionId: idSchema,
  studentNumber: createStudentSchema.shape.studentNumber,
  firstName: personNameSchema,
  lastName: personNameSchema,
  parentName: personNameSchema,
  parentPhone: philippineMobileSchema,
  parentPhoneVerified: z.literal(true),
  parentConsent: z.literal(true),
});

export const getTeacherSetup = onCall(callableOptions, async (request) => {
  const input = parseInput(setupSchema, request.data);
  const member = await requireMembership(
    request,
    input.schoolId,
    "academic.read",
  );
  const { device, lease } = await requireDeviceLease(request, input);
  const root = db.doc(`schools/${input.schoolId}`);
  const schoolWide = ["SCHOOL_ADMIN", "REGISTRAR"].includes(member.role);
  const ids = member.sectionIds.filter(
    (id) =>
      device.allowedSectionIds?.includes(id) && lease.sectionIds?.includes(id),
  );
  const [sections, years, grades] = await Promise.all([
    schoolWide
      ? root
          .collection("sections")
          .get()
          .then((s) => s.docs)
      : ids.length
        ? db.getAll(...ids.map((id) => root.collection("sections").doc(id)))
        : [],
    root.collection("academicYears").where("active", "==", true).get(),
    root.collection("gradeLevels").get(),
  ]);
  const named = (docs: FirebaseFirestore.DocumentSnapshot[]) =>
    docs
      .filter((d) => d.exists && d.get("active") !== false)
      .map((d) => ({ id: d.id, name: String(d.get("name") ?? d.id) }));
  return {
    sections: sections
      .filter((d) => d.exists && d.get("active") !== false)
      .map((d) => ({
        id: d.id,
        name: d.get("name"),
        gradeLevelId: d.get("gradeLevelId"),
        academicYearId: d.get("academicYearId"),
      })),
    academicYears: named(years.docs),
    gradeLevels: named(grades.docs),
  };
});

export const createTeacherSection = onCall(callableOptions, async (request) => {
  const input = parseInput(sectionSchema, request.data);
  const actor = await requireMembership(
    request,
    input.schoolId,
    "section.create",
  );
  const root = db.doc(`schools/${input.schoolId}`);
  const ref = root.collection("sections").doc(input.requestId);
  await db.runTransaction(async (tx) => {
    const { device, lease } = await requireDeviceLease(request, input, tx);
    const [existing, year, grade, member] = await tx.getAll(
      ref,
      root.collection("academicYears").doc(input.academicYearId),
      root.collection("gradeLevels").doc(input.gradeLevelId),
      root.collection("members").doc(actor.uid),
    );
    if (!existing || !year || !grade || !member)
      throw new HttpsError("internal", "Transaction documents are missing.");
    if (member.get("status") !== "ACTIVE")
      throw new HttpsError(
        "permission-denied",
        "Active membership is required.",
      );
    if (existing.exists) {
      if (
        existing.get("createdBy") !== actor.uid ||
        existing.get("name") !== input.name ||
        existing.get("gradeLevelId") !== input.gradeLevelId ||
        existing.get("academicYearId") !== input.academicYearId
      )
        throw new HttpsError(
          "already-exists",
          "This request already created a different section.",
        );
      return;
    }
    if (
      !year.exists ||
      year.get("active") !== true ||
      !grade.exists ||
      grade.get("active") === false
    )
      throw new HttpsError(
        "failed-precondition",
        "Choose an active academic year and grade level.",
      );
    const sections: string[] = member.get("sectionIds") ?? [];
    if (sections.length >= 30 || (device.allowedSectionIds ?? []).length >= 30)
      throw new HttpsError(
        "resource-exhausted",
        "This teacher or phone already has 30 sections.",
      );
    tx.create(ref, {
      name: input.name,
      gradeLevelId: input.gradeLevelId,
      academicYearId: input.academicYearId,
      active: true,
      teacherId: actor.uid,
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(root.collection("members").doc(actor.uid), {
      sectionIds: FieldValue.arrayUnion(ref.id),
    });
    tx.update(root.collection("devices").doc(input.deviceId), {
      allowedSectionIds: FieldValue.arrayUnion(ref.id),
    });
    tx.update(root.collection("deviceLeases").doc(input.leaseId), {
      sectionIds: [...new Set([...(lease.sectionIds ?? []), ref.id])],
    });
    writeAudit(tx, {
      schoolId: input.schoolId,
      eventType: "TEACHER_SECTION_CREATED",
      actorUserId: actor.uid,
      actorDeviceId: input.deviceId,
      targetType: "SECTION",
      targetId: ref.id,
    });
  });
  return { sectionId: ref.id };
});

export const createTeacherStudent = onCall(callableOptions, async (request) => {
  const input = parseInput(studentSchema, request.data);
  const actor = await requireMembership(
    request,
    input.schoolId,
    "student.create",
  );
  assertSectionScope(actor, input.sectionId);
  const root = db.doc(`schools/${input.schoolId}`);
  const student = root.collection("students").doc(input.requestId);
  const guardian = root
    .collection("guardians")
    .doc(`${input.requestId}_parent`);
  const number = root
    .collection("studentNumbers")
    .doc(encodeURIComponent(input.studentNumber.toUpperCase()));
  await db.runTransaction(async (tx) => {
    const { device, lease } = await requireDeviceLease(request, input, tx);
    if (
      !(device.allowedSectionIds ?? []).includes(input.sectionId) ||
      !(lease.sectionIds ?? []).includes(input.sectionId)
    )
      throw new HttpsError(
        "permission-denied",
        "Section is outside this phone's authorization.",
      );
    const [section, existing, unique, parent] = await tx.getAll(
      root.collection("sections").doc(input.sectionId),
      student,
      number,
      guardian,
    );
    if (!section || !existing || !unique || !parent)
      throw new HttpsError("internal", "Transaction documents are missing.");
    if (!section.exists || section.get("active") !== true)
      throw new HttpsError("failed-precondition", "Section is not active.");
    if (existing.exists) {
      if (
        existing.get("createdBy") !== actor.uid ||
        existing.get("sectionId") !== input.sectionId ||
        existing.get("studentNumber") !== input.studentNumber ||
        existing.get("firstName") !== input.firstName ||
        existing.get("lastName") !== input.lastName ||
        parent.get("phoneE164") !== input.parentPhone ||
        parent.get("displayName") !== input.parentName
      )
        throw new HttpsError(
          "already-exists",
          "This request already created a different student.",
        );
      return;
    }
    if (unique.exists)
      throw new HttpsError(
        "already-exists",
        "Student number is already registered.",
      );
    const metadata = {
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const enrollmentId = input.requestId;
    const gradeLevelId = section.get("gradeLevelId"),
      academicYearId = section.get("academicYearId");
    tx.create(student, {
      studentNumber: input.studentNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: `${input.firstName} ${input.lastName}`,
      sectionId: input.sectionId,
      gradeLevelId,
      academicYearId,
      currentEnrollmentId: enrollmentId,
      activeCardId: null,
      status: "ACTIVE",
      ...metadata,
    });
    tx.create(number, { studentId: student.id, ...metadata });
    tx.create(root.collection("enrollments").doc(enrollmentId), {
      studentId: student.id,
      sectionId: input.sectionId,
      gradeLevelId,
      academicYearId,
      status: "ACTIVE",
      ...metadata,
    });
    tx.create(guardian, {
      displayName: input.parentName,
      phoneE164: input.parentPhone,
      phoneMasked: maskPhone(input.parentPhone),
      phoneStatus: "VERIFIED",
      consentStatus: "RECORDED",
      status: "ACTIVE",
      verificationMethod: "TEACHER_ATTESTATION",
      verifiedBy: actor.uid,
      consentRecordedBy: actor.uid,
      ...metadata,
    });
    tx.create(
      root
        .collection("studentGuardianLinks")
        .doc(`${student.id}_${guardian.id}`),
      {
        studentId: student.id,
        guardianId: guardian.id,
        sectionId: input.sectionId,
        relationship: "Parent",
        primary: true,
        receiveArrivalSms: true,
        receiveDismissalSms: true,
        receiveLateSms: true,
        receiveCustomSms: false,
        ...metadata,
      },
    );
    writeAudit(tx, {
      schoolId: input.schoolId,
      eventType: "TEACHER_STUDENT_CREATED",
      actorUserId: actor.uid,
      actorDeviceId: input.deviceId,
      targetType: "STUDENT",
      targetId: student.id,
      after: { sectionId: input.sectionId, guardianId: guardian.id },
    });
  });
  return { studentId: student.id, guardianId: guardian.id };
});
