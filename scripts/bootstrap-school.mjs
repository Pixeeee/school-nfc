
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

const [emailRaw, schoolName, publicCodeRaw, timeZone = "Asia/Manila"] = process.argv.slice(2);
if (!emailRaw || !schoolName || !publicCodeRaw) {
  throw new Error('Usage: node scripts/bootstrap-school.mjs <admin-email> "School Name" <PUBLICCODE> [Asia/Manila]');
}
const email = emailRaw.trim().toLowerCase();
const publicCode = publicCodeRaw.trim().toUpperCase();
if (!/^[A-Z0-9]{6,12}$/.test(publicCode)) throw new Error("Public code must contain 6–12 uppercase letters/numbers.");
initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), platformAdmin: true });
const schoolRef = db.collection("schools").doc();
const codeRef = db.doc(`schoolCodes/${publicCode}`);
const member = {
  uid: user.uid, schoolId: schoolRef.id, email, role: "SCHOOL_ADMIN", status: "ACTIVE", sectionIds: [],
  permissionAdditions: [], permissionRemovals: [], createdAt: FieldValue.serverTimestamp(), createdBy: user.uid,
  updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid,
};
await db.runTransaction(async (tx) => {
  if ((await tx.get(codeRef)).exists) throw new Error("School public code is already in use.");
  tx.create(codeRef, { schoolId: schoolRef.id, createdAt: FieldValue.serverTimestamp() });
  tx.create(schoolRef, { name: schoolName.trim(), publicCode, timeZone, status: "ACTIVE", createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
  tx.create(schoolRef.collection("members").doc(user.uid), member);
  tx.set(db.doc(`users/${user.uid}/schoolMemberships/${schoolRef.id}`), member);
  tx.create(schoolRef.collection("settings").doc("general"), { debounceMs: 3000, offlineLeaseHours: 24, retentionDays: 730, lateCutoff: "08:00", updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
  for (const [eventType, name, body] of [
    ["ARRIVAL", "Arrival notice", "{{schoolName}}: {{studentName}} arrived at {{eventTime}} on {{eventDate}}. Ref: {{shortReference}}"],
    ["DISMISSAL", "Dismissal notice", "{{schoolName}}: {{studentName}} left school at {{eventTime}} on {{eventDate}}. Ref: {{shortReference}}"],
  ]) {
    const ref = schoolRef.collection("smsTemplates").doc();
    tx.create(ref, { eventType, name, body, enabled: true, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
  }
  const auditRef = schoolRef.collection("auditLogs").doc();
  tx.create(auditRef, { schoolId: schoolRef.id, eventType: "SCHOOL_BOOTSTRAPPED", actorUserId: user.uid, targetType: "SCHOOL", targetId: schoolRef.id, createdAt: FieldValue.serverTimestamp() });
});
await auth.revokeRefreshTokens(user.uid);
console.log(JSON.stringify({ schoolId: schoolRef.id, adminUid: user.uid, publicCode }, null, 2));
