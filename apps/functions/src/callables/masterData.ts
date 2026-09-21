
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import {
  createGuardianSchema, createStudentSchema, idSchema, linkGuardianSchema, maskPhone, smsTemplateSchema, updateStudentSchema,
} from "@school-nfc/contracts";
import { db } from "../admin.js";
import { requireMembership } from "../lib/authz.js";
import { writeAudit } from "../lib/audit.js";
import { callableOptions } from "../lib/options.js";
import { parseInput } from "../lib/parse.js";

const academicYearSchema = z.object({ schoolId: idSchema, academicYearId: idSchema.optional(), name: z.string().trim().min(4).max(40), startDate: z.string().date(), endDate: z.string().date(), active: z.boolean() });
const sectionSchema = z.object({ schoolId: idSchema, sectionId: idSchema.optional(), name: z.string().trim().min(1).max(80), gradeLevelId: idSchema, academicYearId: idSchema, active: z.boolean().default(true) });

export const upsertAcademicYear = onCall(callableOptions, async (request) => {
  const input = parseInput(academicYearSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "academic.manage");
  if (input.endDate <= input.startDate) throw new HttpsError("invalid-argument", "End date must be after start date.");
  const ref = input.academicYearId ? db.doc(`schools/${input.schoolId}/academicYears/${input.academicYearId}`) : db.collection(`schools/${input.schoolId}/academicYears`).doc();
  await ref.set({ name: input.name, startDate: input.startDate, endDate: input.endDate, active: input.active, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid, ...(!input.academicYearId ? { createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid } : {}) }, { merge: true });
  return { academicYearId: ref.id };
});

export const upsertSection = onCall(callableOptions, async (request) => {
  const input = parseInput(sectionSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "academic.manage");
  const ref = input.sectionId ? db.doc(`schools/${input.schoolId}/sections/${input.sectionId}`) : db.collection(`schools/${input.schoolId}/sections`).doc();
  await ref.set({ name: input.name, gradeLevelId: input.gradeLevelId, academicYearId: input.academicYearId, active: input.active, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid, ...(!input.sectionId ? { createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid } : {}) }, { merge: true });
  return { sectionId: ref.id };
});

export const createStudent = onCall(callableOptions, async (request) => {
  const input = parseInput(createStudentSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "student.create");
  const studentRef = db.collection(`schools/${input.schoolId}/students`).doc();
  const numberKey = input.studentNumber.toUpperCase();
  const uniqueRef = db.doc(`schools/${input.schoolId}/studentNumbers/${encodeURIComponent(numberKey)}`);
  const enrollmentRef = db.collection(`schools/${input.schoolId}/enrollments`).doc();
  await db.runTransaction(async (tx) => {
    if ((await tx.get(uniqueRef)).exists) throw new HttpsError("already-exists", "Student number is already registered.");
    tx.create(uniqueRef, { studentId: studentRef.id, createdAt: FieldValue.serverTimestamp() });
    tx.create(enrollmentRef, { studentId: studentRef.id, academicYearId: input.academicYearId, gradeLevelId: input.gradeLevelId, sectionId: input.sectionId, status: "ACTIVE", createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid });
    tx.create(studentRef, {
      studentNumber: input.studentNumber, firstName: input.firstName, middleName: input.middleName ?? "", lastName: input.lastName,
      suffix: input.suffix, preferredName: input.preferredName, displayName: [input.preferredName || input.firstName, input.lastName].join(" "),
      status: input.status, currentEnrollmentId: enrollmentRef.id, gradeLevelId: input.gradeLevelId, sectionId: input.sectionId, academicYearId: input.academicYearId,
      activeCardId: null, createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    });
    writeAudit(tx, { schoolId: input.schoolId, eventType: "STUDENT_CREATED", actorUserId: actor.uid, targetType: "STUDENT", targetId: studentRef.id, after: { studentNumber: input.studentNumber, displayName: `${input.firstName} ${input.lastName}`, sectionId: input.sectionId } });
  });
  return { studentId: studentRef.id, enrollmentId: enrollmentRef.id };
});

export const updateStudent = onCall(callableOptions, async (request) => {
  const input = parseInput(updateStudentSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "student.update");
  const ref = db.doc(`schools/${input.schoolId}/students/${input.studentId}`);
  const existing = await ref.get();
  if (!existing.exists) throw new HttpsError("not-found", "Student was not found.");
  const { schoolId: _schoolId, studentId: _studentId, ...changes } = input;
  await db.runTransaction(async (tx) => {
    tx.update(ref, { ...changes, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    writeAudit(tx, { schoolId: input.schoolId, eventType: "STUDENT_UPDATED", actorUserId: actor.uid, targetType: "STUDENT", targetId: input.studentId, before: existing.data(), after: changes });
  });
  return { studentId: input.studentId };
});

export const createGuardian = onCall(callableOptions, async (request) => {
  const input = parseInput(createGuardianSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "guardian.create");
  const ref = db.collection(`schools/${input.schoolId}/guardians`).doc();
  await ref.create({ displayName: input.displayName, phoneE164: input.phone, phoneMasked: maskPhone(input.phone), phoneStatus: input.phoneStatus, consentStatus: input.consentStatus, status: "ACTIVE", createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
  return { guardianId: ref.id };
});

export const linkGuardian = onCall(callableOptions, async (request) => {
  const input = parseInput(linkGuardianSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "guardian.update");
  const studentRef = db.doc(`schools/${input.schoolId}/students/${input.studentId}`);
  const guardianRef = db.doc(`schools/${input.schoolId}/guardians/${input.guardianId}`);
  const linkId = `${input.studentId}_${input.guardianId}`;
  const linkRef = db.doc(`schools/${input.schoolId}/studentGuardianLinks/${linkId}`);
  await db.runTransaction(async (tx) => {
    const [student, guardian] = await tx.getAll(studentRef, guardianRef);
    if (!student.exists || !guardian.exists) throw new HttpsError("not-found", "Student or guardian was not found.");
    tx.set(linkRef, { ...input, schoolId: FieldValue.delete(), sectionId: student.data()?.sectionId, createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    writeAudit(tx, { schoolId: input.schoolId, eventType: "GUARDIAN_LINKED", actorUserId: actor.uid, targetType: "STUDENT_GUARDIAN_LINK", targetId: linkId, after: { studentId: input.studentId, guardianId: input.guardianId, relationship: input.relationship } });
  });
  return { linkId };
});

export const upsertSmsTemplate = onCall(callableOptions, async (request) => {
  const input = parseInput(smsTemplateSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "sms.template.manage");
  const ref = input.templateId ? db.doc(`schools/${input.schoolId}/smsTemplates/${input.templateId}`) : db.collection(`schools/${input.schoolId}/smsTemplates`).doc();
  await ref.set({ eventType: input.eventType, name: input.name, body: input.body, enabled: input.enabled, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid, ...(!input.templateId ? { createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid } : {}) }, { merge: true });
  return { templateId: ref.id };
});
