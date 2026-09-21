
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { createSchoolSchema } from "@school-nfc/contracts";
import { db } from "../admin.js";
import { requireUser } from "../lib/authz.js";
import { writeAudit } from "../lib/audit.js";
import { callableOptions } from "../lib/options.js";
import { parseInput } from "../lib/parse.js";

export const createSchool = onCall(callableOptions, async (request) => {
  const actor = requireUser(request);
  if (!actor.platformAdmin) throw new HttpsError("permission-denied", "Platform administrator access is required.");
  const input = parseInput(createSchoolSchema, request.data);
  const schoolRef = db.collection("schools").doc();
  const codeRef = db.doc(`schoolCodes/${input.publicCode}`);
  const memberRef = schoolRef.collection("members").doc(actor.uid);
  const userMembershipRef = db.doc(`users/${actor.uid}/schoolMemberships/${schoolRef.id}`);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(codeRef)).exists) throw new HttpsError("already-exists", "School public code is already in use.");
    tx.create(codeRef, { schoolId: schoolRef.id, createdAt: FieldValue.serverTimestamp() });
    tx.create(schoolRef, {
      name: input.name, publicCode: input.publicCode, timeZone: input.timeZone, status: "ACTIVE",
      createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    });
    const membership = {
      uid: actor.uid, schoolId: schoolRef.id, role: "SCHOOL_ADMIN", status: "ACTIVE",
      permissionAdditions: [], permissionRemovals: [], sectionIds: [], email: actor.email ?? null,
      createdAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    };
    tx.create(memberRef, membership);
    tx.set(userMembershipRef, membership);
    writeAudit(tx, { schoolId: schoolRef.id, eventType: "SCHOOL_CREATED", actorUserId: actor.uid, targetType: "SCHOOL", targetId: schoolRef.id, after: { name: input.name, publicCode: input.publicCode } });
  });
  return { schoolId: schoolRef.id };
});
