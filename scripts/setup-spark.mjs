import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

const [command, projectId, schoolId, ...args] = process.argv.slice(2);
if (!command || !projectId || !schoolId || !/^[A-Za-z0-9_-]+$/.test(schoolId)) {
  throw new Error(
    "Usage: node scripts/setup-spark.mjs <school|teacher|devices|approve|revoke> <project-id> <school-id> [arguments]. See docs/SPARK_SETUP.md.",
  );
}
// This trusted setup tool runs locally, never on a billable Firebase service.
initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const root = db.collection("schools").doc(schoolId);
const stamp = FieldValue.serverTimestamp();
if (command === "school") {
  const [name, adminEmail, yearName, gradeName] = args;
  if (!name || !adminEmail || !yearName || !gradeName)
    throw new Error(
      'school requires "School name" admin-email "Academic year" "Grade".',
    );
  const admin = await getAuth().getUserByEmail(adminEmail);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(root)).exists)
      throw new Error("School exists; refusing to overwrite it.");
    tx.create(root, {
      name,
      publicCode: schoolId
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 12),
      timeZone: "Asia/Manila",
      status: "ACTIVE",
      createdAt: stamp,
    });
    tx.create(root.collection("members").doc(admin.uid), {
      status: "ACTIVE",
      role: "SCHOOL_ADMIN",
      email: admin.email,
      effectivePermissions: [],
      sectionIds: [],
    });
    tx.create(root.collection("academicYears").doc("current"), {
      name: yearName,
      active: true,
    });
    tx.create(root.collection("gradeLevels").doc("initial"), {
      name: gradeName,
      active: true,
    });
    tx.create(root.collection("smsTemplates").doc("arrival"), {
      eventType: "ARRIVAL",
      name: "Arrival",
      body: "{{schoolName}}: {{studentName}} is present on {{eventDate}} at {{eventTime}}.",
      enabled: true,
    });
    tx.create(root.collection("smsTemplates").doc("dismissal"), {
      eventType: "DISMISSAL",
      name: "Dismissal",
      body: "{{schoolName}}: {{studentName}} was dismissed on {{eventDate}} at {{eventTime}}.",
      enabled: true,
    });
  });
  console.log("School provisioned. School ID:", schoolId);
} else if (command === "teacher") {
  const [email] = args;
  if (!email)
    throw new Error("teacher requires an existing Firebase Auth email.");
  if (!(await root.get()).exists)
    throw new Error("Provision the school first.");
  const user = await getAuth().getUserByEmail(email);
  await db.runTransaction(async (tx) => {
    const ref = root.collection("members").doc(user.uid);
    if ((await tx.get(ref)).exists)
      throw new Error("Membership exists; refusing to overwrite it.");
    tx.create(ref, {
      status: "ACTIVE",
      role: "TEACHER",
      email: user.email,
      effectivePermissions: [],
      sectionIds: [],
    });
  });
  console.log("Teacher provisioned:", user.uid);
} else if (command === "devices") {
  const docs = await root.collection("sparkDevices").get();
  docs.forEach((doc) =>
    console.log(
      doc.id,
      doc.get("displayName"),
      doc.get("status"),
      doc.get("assignedUserId"),
    ),
  );
} else if (command === "approve" || command === "revoke") {
  const [deviceId, expectedTeacherUid] = args;
  if (!deviceId || !expectedTeacherUid)
    throw new Error(
      "approve/revoke requires device ID and expected teacher UID.",
    );
  const ref = root.collection("sparkDevices").doc(deviceId);
  await db.runTransaction(async (tx) => {
    const device = await tx.get(ref);
    const member = await tx.get(
      root.collection("members").doc(expectedTeacherUid),
    );
    if (
      !device.exists ||
      device.get("assignedUserId") !== expectedTeacherUid ||
      member.get("status") !== "ACTIVE"
    )
      throw new Error("Device owner or active membership does not match.");
    tx.update(ref, {
      status: command === "approve" ? "APPROVED" : "REVOKED",
      leaseExpiresAt: Timestamp.fromMillis(
        command === "approve" ? Date.now() + 6 * 86400000 : 0,
      ),
      updatedAt: stamp,
    });
  });
  console.log(
    "Device",
    command === "approve" ? "approved" : "revoked",
    deviceId,
  );
} else {
  throw new Error("Unknown command.");
}
