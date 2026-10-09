import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

let env: RulesTestEnvironment;
const base = "schools/schoolA";
const attendanceKey = "schoolA|studentA|2026-10-09|ARRIVAL";
const future = () => Timestamp.fromMillis(Date.now() + 86400000);
const device = (uid: string) => ({
  assignedUserId: uid,
  displayName: "Phone",
  status: "APPROVED",
  leaseExpiresAt: future(),
  createdAt: Timestamp.now(),
});
const section = (uid = "teacherA") => ({
  name: "A",
  gradeLevelId: "grade",
  academicYearId: "year",
  teacherId: uid,
  active: true,
  deviceId: uid,
  createdAt: serverTimestamp(),
});
const student = (changes = {}) => ({
  sectionId: "sectionA",
  studentNumber: "A001",
  firstName: "Ada",
  lastName: "Cruz",
  displayName: "Ada Cruz",
  parentName: "Parent",
  parentPhone: "+639123456789",
  parentPhoneVerified: true,
  parentConsent: true,
  status: "ACTIVE",
  createdBy: "teacherA",
  deviceId: "teacherA",
  createdAt: serverTimestamp(),
  ...changes,
});
const attendance = (changes = {}) => ({
  eventUuid: "eventA",
  studentId: "studentA",
  sectionId: "sectionA",
  teacherId: "teacherA",
  deviceId: "teacherA",
  source: "MANUAL",
  cardId: null,
  eventType: "ARRIVAL",
  localSchoolDate: "2026-10-09",
  localTimestamp: "2026-10-09T08:00:00+08:00",
  timezone: "Asia/Manila",
  smsExpectedCount: 1,
  receivedAt: serverTimestamp(),
  ...changes,
});
const sms = (changes = {}) => ({
  attendanceKey,
  attendanceEventId: "eventA",
  studentId: "studentA",
  sectionId: "sectionA",
  guardianId: "studentA_parent",
  teacherId: "teacherA",
  deviceId: "teacherA",
  status: "QUEUED",
  attemptCount: 0,
  sentAt: null,
  deliveredAt: null,
  lastErrorCode: null,
  updatedAt: serverTimestamp(),
  ...changes,
});
const dbFor = (uid = "teacherA") => env.authenticatedContext(uid).firestore();
const ref = (db: ReturnType<typeof dbFor>, path: string) =>
  doc(db, `${base}/${path}`);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-school-spark",
    firestore: {
      rules: readFileSync(
        resolve("../../firebase/firestore.spark.rules"),
        "utf8",
      ),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});
afterEach(async () => env.clearFirestore());
afterAll(async () => env?.cleanup());
async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, base), { status: "ACTIVE", timeZone: "Asia/Manila" });
    for (const uid of ["teacherA", "teacherB", "admin"]) {
      await setDoc(ref(db, `members/${uid}`), {
        status: "ACTIVE",
        role: uid === "admin" ? "SCHOOL_ADMIN" : "TEACHER",
        effectivePermissions: [],
      });
      await setDoc(ref(db, `sparkDevices/${uid}`), device(uid));
    }
    await setDoc(ref(db, "academicYears/year"), { active: true });
    await setDoc(ref(db, "gradeLevels/grade"), { active: true });
    await setDoc(ref(db, "sparkSections/sectionA"), section());
    await setDoc(ref(db, "sparkSections/sectionB"), section("teacherB"));
    await setDoc(ref(db, "nfcCards/cardA"), {
      status: "ACTIVE",
      studentId: "studentA",
      sectionId: "sectionA",
    });
  });
}
async function createStudent(db = dbFor(), changes = {}, index = true) {
  const data = student(changes);
  const batch = writeBatch(db);
  batch.set(ref(db, "sparkStudents/studentA"), data);
  if (index)
    batch.set(ref(db, `sparkStudentNumbers/${data.studentNumber}`), {
      studentId: "studentA",
      sectionId: data.sectionId,
    });
  return batch.commit();
}
async function ready() {
  await seed();
  const db = dbFor();
  await createStudent(db);
  await setDoc(ref(db, `sparkAttendance/${attendanceKey}`), attendance());
  return db;
}

describe("Spark client trust boundaries", () => {
  it("allows approved teacher section, atomic student, attendance and SMS lifecycle", async () => {
    const db = await ready();
    await assertSucceeds(setDoc(ref(db, "sparkSections/new"), section()));
    await assertSucceeds(setDoc(ref(db, "sparkSms/message"), sms()));
    await assertSucceeds(
      updateDoc(ref(db, "sparkSms/message"), {
        status: "SENT",
        attemptCount: 1,
        sentAt: "2026-10-09T08:00:00+08:00",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDoc(ref(db, "sparkStudents/studentA")));
    await assertSucceeds(getDoc(ref(db, "sparkStudents/missing")));
    await assertSucceeds(getDoc(ref(db, "sparkSms/missing")));
    await assertSucceeds(
      getDocs(
        query(
          collection(db, `${base}/sparkAttendance`),
          where("teacherId", "==", "teacherA"),
          where("eventUuid", "==", "eventA"),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, `${base}/sparkSections`),
          where("teacherId", "==", "teacherA"),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, `${base}/sparkStudents`),
          where("sectionId", "in", ["sectionA"]),
        ),
      ),
    );
  });
  it("accepts native nanosecond timestamps and eight SMS attempts", async () => {
    await seed();
    await createStudent();
    const db = dbFor();
    const nativeTimestamp = "2026-10-09T00:00:00.123456789Z";
    await assertSucceeds(
      setDoc(
        ref(db, `sparkAttendance/${attendanceKey}`),
        attendance({ localTimestamp: nativeTimestamp }),
      ),
    );
    await assertSucceeds(
      setDoc(
        ref(db, "sparkSms/native"),
        sms({ status: "SENT", attemptCount: 8, sentAt: nativeTimestamp }),
      ),
    );
    await assertSucceeds(
      updateDoc(ref(db, "sparkSms/native"), {
        status: "DELIVERED",
        deliveredAt: nativeTimestamp,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(ref(db, "sparkSms/native"), {
        attemptCount: 9,
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("denies unauthenticated and foreign-school access", async () => {
    await seed();
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), base)),
    );
    await assertFails(getDoc(doc(dbFor(), "schools/schoolB")));
    await assertFails(
      setDoc(doc(dbFor(), "schools/schoolB/sparkSections/new"), section()),
    );
  });
  it("denies foreign section reads and writes and unscoped lists", async () => {
    await ready();
    await assertFails(getDoc(ref(dbFor("teacherB"), "sparkStudents/studentA")));
    await assertFails(createStudent(dbFor("teacherB")));
    await assertFails(getDocs(collection(dbFor(), `${base}/sparkStudents`)));
    await assertFails(
      getDocs(collection(dbFor(), `${base}/sparkStudentNumbers`)),
    );
  });
  it("requires atomic matching index and prevents duplicates", async () => {
    await seed();
    await assertFails(createStudent(dbFor(), {}, false));
    await assertFails(
      setDoc(ref(dbFor(), "sparkStudentNumbers/A001"), {
        studentId: "studentA",
        sectionId: "sectionA",
      }),
    );
    await assertSucceeds(createStudent());
    const db = dbFor();
    const batch = writeBatch(db);
    batch.set(ref(db, "sparkStudents/duplicate"), student());
    batch.set(ref(db, "sparkStudentNumbers/A001"), {
      studentId: "duplicate",
      sectionId: "sectionA",
    });
    await assertFails(batch.commit());
  });
  it("rejects invalid parent phone, consent and student identity", async () => {
    await seed();
    for (const invalid of [
      { parentPhone: "09123456789" },
      { parentConsent: false },
      { parentPhoneVerified: false },
      { studentNumber: "lowercase" },
      { displayName: "Wrong" },
    ])
      await assertFails(createStudent(dbFor(), invalid));
  });
  it("prevents self approval and rejects unapproved, foreign and expired devices", async () => {
    await seed();
    const db = dbFor();
    await assertSucceeds(
      setDoc(ref(db, "sparkDevices/pending"), {
        ...device("teacherA"),
        status: "PENDING",
        createdAt: serverTimestamp(),
        leaseExpiresAt: Timestamp.fromMillis(0),
      }),
    );
    await assertFails(
      updateDoc(ref(db, "sparkDevices/pending"), { status: "APPROVED" }),
    );
    await assertFails(
      updateDoc(ref(dbFor("admin"), "sparkDevices/pending"), {
        status: "APPROVED",
      }),
    );
    await assertFails(
      setDoc(ref(db, "sparkSections/pending"), {
        ...section(),
        deviceId: "pending",
      }),
    );
    await assertFails(
      setDoc(ref(db, "sparkSections/foreign"), {
        ...section(),
        deviceId: "teacherB",
      }),
    );
    await env.withSecurityRulesDisabled((context) =>
      updateDoc(ref(context.firestore(), "sparkDevices/teacherA"), {
        leaseExpiresAt: Timestamp.fromMillis(0),
      }),
    );
    await assertFails(setDoc(ref(db, "sparkSections/expired"), section()));
    await assertSucceeds(
      updateDoc(ref(db, "sparkDevices/teacherA"), { leaseExpiresAt: future() }),
    );
    await assertFails(
      updateDoc(ref(db, "sparkDevices/teacherA"), {
        leaseExpiresAt: Timestamp.fromMillis(Date.now() + 8 * 86400000),
      }),
    );
  });
  it("denies original collection, guardian PII and metadata writes", async () => {
    await seed();
    for (const path of [
      "students/injected",
      "guardians/injected",
      "members/injected",
      "nfcCards/injected",
      "academicYears/injected",
      "config/injected",
    ])
      await assertFails(
        setDoc(ref(dbFor("admin"), path), {
          sectionId: "sectionA",
          parentPhone: "+639123456789",
        }),
      );
  });
  it("rejects forged manual/NFC events and immutable attendance changes", async () => {
    await seed();
    await createStudent();
    const db = dbFor();
    for (const invalid of [
      { eventType: "DISMISSAL" },
      { cardId: "cardA" },
      { source: "NFC", cardId: "missing" },
      { teacherId: "teacherB" },
      { timezone: "UTC" },
    ])
      await assertFails(
        setDoc(
          ref(db, `sparkAttendance/${attendanceKey}`),
          attendance(invalid),
        ),
      );
    await assertFails(
      setDoc(ref(db, "sparkAttendance/wrong-key"), attendance()),
    );
    await assertSucceeds(
      setDoc(
        ref(db, `sparkAttendance/${attendanceKey}`),
        attendance({ source: "NFC", cardId: "cardA" }),
      ),
    );
    await assertFails(
      updateDoc(ref(db, `sparkAttendance/${attendanceKey}`), {
        smsExpectedCount: 5,
      }),
    );
  });
  it("protects SMS identity, bounded attempts and cloud PII exclusion", async () => {
    const db = await ready();
    for (const invalid of [
      { guardianId: "another_parent" },
      { teacherId: "teacherB" },
      { attendanceEventId: "wrong" },
      { attemptCount: 9 },
      { parentPhone: "+639123456789" },
    ])
      await assertFails(setDoc(ref(db, "sparkSms/message"), sms(invalid)));
    await assertSucceeds(
      setDoc(ref(db, "sparkSms/message"), sms({ attemptCount: 2 })),
    );
    await assertFails(
      updateDoc(ref(db, "sparkSms/message"), {
        attemptCount: 1,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(ref(db, "sparkSms/message"), {
        guardianId: "another_parent",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(ref(dbFor("teacherB"), "sparkSms/message"), {
        status: "SENT",
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("rechecks active membership and consent before SMS writes", async () => {
    const db = await ready();
    await env.withSecurityRulesDisabled((context) =>
      updateDoc(ref(context.firestore(), "sparkStudents/studentA"), {
        parentConsent: false,
      }),
    );
    await assertFails(setDoc(ref(db, "sparkSms/message"), sms()));
    await env.withSecurityRulesDisabled((context) =>
      updateDoc(ref(context.firestore(), "members/teacherA"), {
        status: "SUSPENDED",
      }),
    );
    await assertFails(getDoc(ref(db, "sparkStudents/studentA")));
    await assertFails(setDoc(ref(db, "sparkSections/new"), section()));
  });
});
