import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error("Emulators required; refusing live writes.");
initializeApp({ projectId: "demo-school-nfc" });
const auth = getAuth();
await auth.createUser({
  uid: "spark-native-teacher",
  email: "spark-teacher@example.test",
  password: "Synthetic-test-only-123",
});
const root = getFirestore().doc("schools/spark_native");
await root.set({
  name: "Synthetic school",
  publicCode: "SPARKTEST",
  timeZone: "Asia/Manila",
  status: "ACTIVE",
});
await root.collection("members").doc("spark-native-teacher").set({
  status: "ACTIVE",
  role: "TEACHER",
  effectivePermissions: [],
  sectionIds: [],
});
await root
  .collection("academicYears")
  .doc("current")
  .set({ name: "2026–2027", active: true });
await root
  .collection("gradeLevels")
  .doc("initial")
  .set({ name: "Grade 7", active: true });
console.log("Spark emulator fixture ready; synthetic records only.");
