
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { snapshotRequestSchema } from "@school-nfc/contracts";
import { db } from "../admin.js";
import { requireDeviceLease, requireMembership } from "../lib/authz.js";
import { callableOptions } from "../lib/options.js";
import { parseInput } from "../lib/parse.js";

export const getDeviceSnapshot = onCall(callableOptions, async (request) => {
  const input = parseInput(snapshotRequestSchema, request.data);
  await requireMembership(request, input.schoolId, "scanner.start");
  const { device } = await requireDeviceLease(request, input);
  const sectionIds: string[] = device.allowedSectionIds ?? [];
  if (input.kind === "CONFIG") {
    const [school, settings] = await Promise.all([
      db.doc(`schools/${input.schoolId}`).get(),
      db.doc(`schools/${input.schoolId}/settings/general`).get(),
    ]);
    return { kind: input.kind, items: [{ school: { id: school.id, ...school.data() }, settings: settings.data() ?? {} }], nextCursor: null };
  }
  const collectionName = { STUDENTS: "students", CARDS: "nfcCards", GUARDIANS: "studentGuardianLinks", TEMPLATES: "smsTemplates" }[input.kind];
  let query: FirebaseFirestore.Query = db.collection(`schools/${input.schoolId}/${collectionName}`).orderBy("__name__").limit(input.pageSize);
  if (sectionIds.length > 0 && input.kind === "STUDENTS") {
    query = db.collection(`schools/${input.schoolId}/students`).where("sectionId", sectionIds.length === 1 ? "==" : "in", sectionIds.length === 1 ? sectionIds[0] : sectionIds).orderBy("__name__").limit(input.pageSize);
  }
  if (sectionIds.length > 0 && input.kind === "CARDS") {
    query = db.collection(`schools/${input.schoolId}/nfcCards`).where("sectionId", sectionIds.length === 1 ? "==" : "in", sectionIds.length === 1 ? sectionIds[0] : sectionIds).orderBy("__name__").limit(input.pageSize);
  }
  if (sectionIds.length > 0 && input.kind === "GUARDIANS") {
    query = db.collection(`schools/${input.schoolId}/studentGuardianLinks`).where("sectionId", sectionIds.length === 1 ? "==" : "in", sectionIds.length === 1 ? sectionIds[0] : sectionIds).orderBy("__name__").limit(input.pageSize);
  }
  if (input.cursor) {
    const cursor = await db.doc(`schools/${input.schoolId}/${collectionName}/${input.cursor}`).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const result = await query.get();
  let items = result.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  if (input.kind === "CARDS") items = items.map((item: any) => ({ id: item.id, studentId: item.studentId, tokenHash: item.tokenHash, tagUidHash: item.tagUidHash ?? null, status: item.status, payloadVersion: item.payloadVersion, updatedAt: item.updatedAt ?? null }));
  if (input.kind === "GUARDIANS") {
    const guardianIds = [...new Set(items.map((item: any) => item.guardianId).filter(Boolean))].slice(0, 100);
    const guardianDocs = guardianIds.length ? await db.getAll(...guardianIds.map((id) => db.doc(`schools/${input.schoolId}/guardians/${id}`))) : [];
    const guardianMap = new Map(guardianDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));
    items = items.map((link: any) => {
      const guardian: any = guardianMap.get(link.guardianId) ?? {};
      return { ...link, phoneE164: guardian.phoneE164, phoneStatus: guardian.phoneStatus, consentStatus: guardian.consentStatus, guardianStatus: guardian.status };
    });
  }
  const nextCursor = result.size === input.pageSize ? result.docs.at(-1)?.id ?? null : null;
  return { kind: input.kind, items, nextCursor };
});
