import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

let env: RulesTestEnvironment;
const projectId = "school-nfc-rules-test";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(resolve("../../firebase/firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});
afterEach(async () => env.clearFirestore());
afterAll(async () => env.cleanup());

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "schools/schoolA"), { name: "A" });
    await setDoc(doc(db, "schools/schoolA/members/admin"), {
      role: "SCHOOL_ADMIN",
      status: "ACTIVE",
      sectionIds: [],
      effectivePermissions: ["audit.read"],
    });
    await setDoc(doc(db, "schools/schoolA/members/teacher"), {
      role: "TEACHER",
      status: "ACTIVE",
      sectionIds: ["sectionA"],
      effectivePermissions: ["student.read", "attendance.read"],
    });
    await setDoc(doc(db, "schools/schoolB/members/other"), {
      role: "SCHOOL_ADMIN",
      status: "ACTIVE",
      sectionIds: [],
      effectivePermissions: ["audit.read"],
    });
    await setDoc(doc(db, "schools/schoolA/students/studentA"), {
      displayName: "Student A",
      sectionId: "sectionA",
    });
    await setDoc(doc(db, "schools/schoolA/students/studentB"), {
      displayName: "Student B",
      sectionId: "sectionB",
    });
    await setDoc(doc(db, "schools/schoolA/auditLogs/log1"), {
      eventType: "TEST",
    });
  });
}

describe("Firestore tenant and write boundaries", () => {
  it("keeps teacher SMS preferences private and prevents privilege fields", async () => {
    await seed();
    const own = env.authenticatedContext("teacher").firestore();
    const profile = {
      username: "sir_jade",
      schoolName: "Nara School",
      updatedAt: serverTimestamp(),
    };
    await assertSucceeds(
      setDoc(doc(own, "schools/schoolA/teacherSmsProfiles/teacher"), profile),
    );
    await assertSucceeds(
      getDoc(doc(own, "schools/schoolA/teacherSmsProfiles/teacher")),
    );
    await assertFails(
      setDoc(doc(own, "schools/schoolA/teacherSmsProfiles/admin"), profile),
    );
    await assertFails(
      setDoc(doc(own, "schools/schoolB/teacherSmsProfiles/teacher"), profile),
    );
    await assertFails(
      setDoc(doc(own, "schools/schoolA/teacherSmsProfiles/teacher"), {
        ...profile,
        role: "SCHOOL_ADMIN",
      }),
    );
  });
  it("denies unauthenticated school reads", async () => {
    await seed();
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), "schools/schoolA")),
    );
  });
  it("allows active member school read but denies cross-school", async () => {
    await seed();
    await assertSucceeds(
      getDoc(
        doc(env.authenticatedContext("teacher").firestore(), "schools/schoolA"),
      ),
    );
    await assertFails(
      getDoc(
        doc(env.authenticatedContext("other").firestore(), "schools/schoolA"),
      ),
    );
  });
  it("enforces teacher section scope for direct student get", async () => {
    await seed();
    const db = env.authenticatedContext("teacher").firestore();
    await assertSucceeds(getDoc(doc(db, "schools/schoolA/students/studentA")));
    await assertFails(getDoc(doc(db, "schools/schoolA/students/studentB")));
  });
  it("denies client student writes even to administrators", async () => {
    await seed();
    await assertFails(
      setDoc(
        doc(
          env.authenticatedContext("admin").firestore(),
          "schools/schoolA/students/new",
        ),
        { displayName: "Injected", sectionId: "sectionA" },
      ),
    );
  });
  it("keeps audit logs append-only and admin/auditor readable", async () => {
    await seed();
    const admin = env.authenticatedContext("admin").firestore();
    await assertSucceeds(getDoc(doc(admin, "schools/schoolA/auditLogs/log1")));
    await assertFails(
      setDoc(doc(admin, "schools/schoolA/auditLogs/log2"), {
        eventType: "FORGED",
      }),
    );
  });
});
