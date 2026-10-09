import { readFileSync } from "node:fs";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const [projectId, schoolId, username, email, name] = process.argv.slice(2);
if (
  !projectId ||
  !/^[a-z0-9-]+$/.test(projectId) ||
  !schoolId ||
  !/^[A-Za-z0-9_-]+$/.test(schoolId) ||
  !username ||
  !/^[a-z0-9_]{3,40}$/.test(username) ||
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !name
)
  throw new Error(
    'Usage: node scripts/provision-portal-admin.mjs project-id school-id username email name. Supply {"password":"..."} on stdin.',
  );
const { password } = JSON.parse(readFileSync(0, "utf8"));
if (
  typeof password !== "string" ||
  password.length < 8 ||
  password.length > 128
)
  throw new Error("Password must be between 8 and 128 characters.");
initializeApp({ projectId, credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();
const base = db.doc("schools/" + schoolId);
const handle = db.doc("loginNames/" + username);
const existingHandle = await handle.get();
if (existingHandle.exists && existingHandle.data().email !== email)
  throw new Error("Username belongs to another account.");
let user;
try {
  user = await auth.getUserByEmail(email);
} catch (error) {
  if (error.code !== "auth/user-not-found") throw error;
}
// Do not change the credentials of an existing account.
if (user)
  throw new Error(
    "Administrator Auth account already exists. Link its existing UID explicitly; do not overwrite its password.",
  );
user = await auth.createUser({
  email,
  password,
  displayName: name,
  disabled: true,
});
try {
  await db.runTransaction(async (tx) => {
    const school = await tx.get(base);
    const named = await tx.get(handle);
    if (named.exists && named.data().uid !== user.uid)
      throw new Error("Username belongs to another account.");
    const stamp = FieldValue.serverTimestamp();
    if (!school.exists) {
      tx.create(base, {
        name: "School Attendance",
        publicCode: "SCHOOLATTENDANCE",
        timeZone: "Asia/Manila",
        status: "ACTIVE",
        createdAt: stamp,
      });
      tx.create(base.collection("academicYears").doc("current"), {
        name: "2026–2027",
        active: true,
      });
      tx.create(base.collection("gradeLevels").doc("initial"), {
        name: "General",
        active: true,
      });
      tx.create(base.collection("smsTemplates").doc("arrival"), {
        eventType: "ARRIVAL",
        name: "Arrival",
        body: "{{schoolName}}: {{studentName}} is present on {{eventDate}} at {{eventTime}}.",
        enabled: true,
      });
      tx.create(base.collection("smsTemplates").doc("dismissal"), {
        eventType: "DISMISSAL",
        name: "Dismissal",
        body: "{{schoolName}}: {{studentName}} was dismissed on {{eventDate}} at {{eventTime}}.",
        enabled: true,
      });
    }
    tx.create(base.collection("members").doc(user.uid), {
      status: "ACTIVE",
      role: "SCHOOL_ADMIN",
      email,
      displayName: name,
      effectivePermissions: [],
      sectionIds: [],
      createdAt: stamp,
    });
    tx.create(handle, { uid: user.uid, email });
  });
  await auth.updateUser(user.uid, { disabled: false });
  console.log(
    "Administrator provisioned. School ID:",
    schoolId,
    "UID:",
    user.uid,
  );
} catch (error) {
  await auth.updateUser(user.uid, { disabled: true }).catch(() => {});
  throw new Error(
    "Administrator provisioning failed; account remains disabled. Check Firebase setup before retrying.",
  );
}
