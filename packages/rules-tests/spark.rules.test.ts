import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
  it("keeps administrator Firebase reads available while denying class and attendance mutations", async () => {
    await ready();
    const admin = dbFor("admin");
    await assertSucceeds(getDoc(ref(admin, "sparkStudents/studentA")));
    await assertSucceeds(
      getDoc(ref(admin, `sparkAttendance/${attendanceKey}`)),
    );
    await assertFails(
      setDoc(ref(admin, "sparkSections/adminSection"), section("admin")),
    );
    const adminStudent = writeBatch(admin);
    adminStudent.set(
      ref(admin, "sparkStudents/adminStudent"),
      student({
        studentNumber: "ADMIN1",
        createdBy: "admin",
        deviceId: "admin",
      }),
    );
    adminStudent.set(ref(admin, "sparkStudentNumbers/ADMIN1"), {
      studentId: "adminStudent",
      sectionId: "sectionA",
    });
    await assertFails(adminStudent.commit());
    await assertFails(
      setDoc(
        ref(
          admin,
          "sparkAttendance/schoolA|studentA|2026-10-09|ROLLCALL|admin1",
        ),
        attendance({
          eventUuid: "admin1",
          teacherId: "admin",
          deviceId: "admin",
        }),
      ),
    );
    await env.withSecurityRulesDisabled(async (context) =>
      setDoc(ref(context.firestore(), "sparkSubjects/adminSubject"), {
        sectionId: "sectionA",
        teacherId: "admin",
        active: true,
        name: "Math",
        startTime: "08:00",
        endTime: "09:00",
      }),
    );
    await assertFails(
      updateDoc(ref(admin, "sparkSubjects/adminSubject"), { name: "Changed" }),
    );
    await assertFails(
      setDoc(ref(admin, "sparkDismissals/sectionA_2026-10-09"), {
        sectionId: "sectionA",
        teacherId: "admin",
        deviceId: "admin",
        localSchoolDate: "2026-10-09",
        localTimestamp: "2026-10-09T08:00:00+08:00",
        createdAt: serverTimestamp(),
        studentIds: ["studentA"],
      }),
    );
    await assertFails(
      setDoc(
        ref(admin, "sparkSms/adminMessage"),
        sms({ teacherId: "admin", deviceId: "admin" }),
      ),
    );
  });
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
  it("allows class creation without phone registration while preserving ownership", async () => {
    await seed();
    const db = dbFor();
    await assertSucceeds(
      setDoc(ref(db, "sparkSections/no_phone"), {
        ...section(),
        deviceId: "never-registered",
      }),
    );
    await assertFails(
      setDoc(ref(db, "sparkSections/other_owner"), {
        ...section("teacherB"),
        deviceId: "never-registered",
      }),
    );
    await assertFails(
      setDoc(ref(dbFor("outsider"), "sparkSections/outsider"), {
        ...section("outsider"),
        deviceId: "never-registered",
      }),
    );
  });
  it("allows immutable manual Absent events without phone registration", async () => {
    await seed();
    const db = dbFor();
    await createStudent(db);
    const data = {
      ...attendance(),
      eventUuid: "absent-event",
      eventType: "ABSENT",
      source: "MANUAL",
      cardId: null,
      deviceId: "never-registered",
    };
    await assertSucceeds(
      setDoc(
        ref(
          db,
          "sparkAttendance/schoolA|studentA|2026-10-09|ROLLCALL|absent-event",
        ),
        data,
      ),
    );
    await assertFails(
      setDoc(
        ref(
          dbFor("teacherB"),
          "sparkAttendance/schoolA|studentA|2026-10-09|ROLLCALL|intrusion",
        ),
        { ...data, eventUuid: "intrusion", teacherId: "teacherB" },
      ),
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

describe("subjects and adviser dismissal", () => {
  it("allows native setup queries for legacy creators, advisers and assigned subject teachers", async () => {
    await seed();
    await assertSucceeds(
      getDocs(
        query(
          collection(dbFor(), `${base}/sparkSections`),
          where("teacherId", "==", "teacherA"),
        ),
      ),
    );
    const legacyAdviser = await assertSucceeds(
      getDocs(
        query(
          collection(dbFor(), `${base}/sparkSections`),
          where("adviserId", "==", "teacherA"),
        ),
      ),
    );
    expect(legacyAdviser.size).toBe(0);
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(ref(context.firestore(), "sparkSections/sectionA"), {
        adviserId: "teacherB",
        subjectTeacherIds: ["teacherA"],
      });
    });
    const adviser = await assertSucceeds(
      getDocs(
        query(
          collection(dbFor("teacherB"), `${base}/sparkSections`),
          where("adviserId", "==", "teacherB"),
        ),
      ),
    );
    expect(adviser.docs.some((doc) => doc.id === "sectionA")).toBe(true);
    const subject = await assertSucceeds(
      getDocs(
        query(
          collection(dbFor(), `${base}/sparkSections`),
          where("subjectTeacherIds", "array-contains", "teacherA"),
        ),
      ),
    );
    expect(subject.docs.some((doc) => doc.id === "sectionA")).toBe(true);
  });

  async function assigned() {
    await seed();
    await createStudent();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(ref(db, "sparkSections/sectionA"), {
        adviserId: "teacherB",
        subjectTeacherIds: ["teacherA"],
      });
      await setDoc(ref(db, "sparkSubjects/math"), {
        sectionId: "sectionA",
        teacherId: "teacherA",
        name: "Math",
        startTime: "08:00",
        endTime: "09:00",
        active: true,
      });
      await setDoc(ref(db, "sparkSubjects/science"), {
        sectionId: "sectionA",
        teacherId: "teacherB",
        name: "Science",
        startTime: "09:00",
        endTime: "10:00",
        active: true,
      });
    });
  }
  it("shares roster while restricting subject writes and assignment changes", async () => {
    await assigned();
    const db = dbFor();
    await assertSucceeds(getDoc(ref(db, "sparkStudents/studentA")));
    await assertFails(
      updateDoc(ref(db, "sparkSections/sectionA"), {
        subjectTeacherIds: ["stranger"],
      }),
    );
    await assertSucceeds(
      updateDoc(ref(db, "sparkSubjects/math"), {
        name: "Mathematics",
        startTime: "08:30",
        endTime: "09:30",
      }),
    );
    await assertFails(
      updateDoc(ref(db, "sparkSubjects/math"), { endTime: "07:00" }),
    );
    await assertFails(
      updateDoc(ref(db, "sparkSubjects/science"), { name: "Stolen" }),
    );
    await assertSucceeds(
      setDoc(
        ref(db, "sparkAttendance/schoolA|studentA|2026-10-09|math|ROLLCALL|m1"),
        attendance({
          eventUuid: "m1",
          subjectId: "math",
          attendanceTag: "ON_TIME",
        }),
      ),
    );
    await assertFails(
      setDoc(
        ref(
          db,
          "sparkAttendance/schoolA|studentA|2026-10-09|science|ROLLCALL|s1",
        ),
        attendance({
          eventUuid: "s1",
          subjectId: "science",
          attendanceTag: "ABSENT",
          eventType: "ABSENT",
        }),
      ),
    );
    await assertFails(
      setDoc(
        ref(db, "sparkAttendance/schoolA|studentA|2026-10-09|math|ROLLCALL|m2"),
        attendance({
          eventUuid: "m2",
          subjectId: "math",
          attendanceTag: "PRESENT",
        }),
      ),
    );
    await assertFails(
      setDoc(ref(db, `sparkAttendance/${attendanceKey}`), attendance()),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(dbFor("teacherB"), `${base}/sparkAttendance`),
          where("sectionId", "==", "sectionA"),
          where("localSchoolDate", "==", "2026-10-09"),
        ),
      ),
    );
  });
  it("reassigned creator loses parent and roster access without a subject assignment", async () => {
    await assigned();
    await env.withSecurityRulesDisabled(async (context) =>
      updateDoc(ref(context.firestore(), "sparkSections/sectionA"), {
        subjectTeacherIds: [],
      }),
    );
    await assertFails(getDoc(ref(dbFor(), "sparkStudents/studentA")));
    await assertFails(
      setDoc(ref(dbFor(), `sparkAttendance/${attendanceKey}`), attendance()),
    );
    await assertFails(createStudent(dbFor(), { studentNumber: "NEW" }));
    await assertSucceeds(
      getDoc(ref(dbFor("teacherB"), "sparkStudents/studentA")),
    );
  });
  it("protects a single immutable section/day Out claim and requires it for dismissal", async () => {
    await assigned();
    const path = "sparkDismissals/sectionA_2026-10-09";
    const claim = {
      sectionId: "sectionA",
      localSchoolDate: "2026-10-09",
      teacherId: "teacherB",
      deviceId: "teacherB",
      studentIds: ["studentA"],
      localTimestamp: "2026-10-09T10:00:00Z",
      createdAt: serverTimestamp(),
    };
    await assertFails(
      setDoc(ref(dbFor(), path), {
        ...claim,
        teacherId: "teacherA",
        deviceId: "teacherA",
      }),
    );
    await assertSucceeds(setDoc(ref(dbFor("teacherB"), path), claim));
    await assertSucceeds(getDoc(ref(dbFor("teacherB"), path)));
    await assertFails(setDoc(ref(dbFor("teacherB"), path), claim));
    await assertSucceeds(
      setDoc(
        ref(
          dbFor("teacherB"),
          "sparkAttendance/schoolA|studentA|2026-10-09|DISMISSAL",
        ),
        attendance({
          eventUuid: "out",
          localTimestamp: claim.localTimestamp,
          teacherId: "teacherB",
          deviceId: "teacherB",
          eventType: "DISMISSAL",
        }),
      ),
    );
    const dismissal = attendance({
      eventUuid: "out",
      teacherId: "teacherB",
      deviceId: "teacherB",
      eventType: "DISMISSAL",
      localTimestamp: claim.localTimestamp,
    });
    await assertFails(
      setDoc(
        ref(
          dbFor("teacherB"),
          "sparkAttendance/schoolA|studentA|2026-10-09|DISMISSAL",
        ),
        dismissal,
      ),
    );
    await assertFails(
      setDoc(
        ref(
          dbFor("teacherB"),
          "sparkAttendance/schoolA|studentA|2026-10-09|ROLLCALL|bypass",
        ),
        { ...dismissal, eventUuid: "bypass" },
      ),
    );
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        ref(context.firestore(), "sparkStudents/studentOutsideClaim"),
        student({ studentNumber: "OUTSIDE" }),
      );
    });
    await assertFails(
      setDoc(
        ref(
          dbFor("teacherB"),
          "sparkAttendance/schoolA|studentOutsideClaim|2026-10-09|DISMISSAL",
        ),
        {
          ...dismissal,
          studentId: "studentOutsideClaim",
          eventUuid: "outside",
        },
      ),
    );
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        ref(context.firestore(), "sparkStudents/studentWrongTime"),
        student({ studentNumber: "WRONGTIME" }),
      );
      await updateDoc(ref(context.firestore(), path), {
        studentIds: ["studentA", "studentWrongTime"],
      });
    });
    await assertFails(
      setDoc(
        ref(
          dbFor("teacherB"),
          "sparkAttendance/schoolA|studentWrongTime|2026-10-09|DISMISSAL",
        ),
        {
          ...dismissal,
          studentId: "studentWrongTime",
          eventUuid: "wrongtime",
          localTimestamp: "2026-10-09T10:05:00Z",
        },
      ),
    );
    await assertFails(
      setDoc(
        ref(
          dbFor("teacherB"),
          "sparkAttendance/schoolA|studentA|2026-10-10|DISMISSAL",
        ),
        attendance({
          eventUuid: "out2",
          teacherId: "teacherB",
          deviceId: "teacherB",
          eventType: "DISMISSAL",
          localSchoolDate: "2026-10-10",
        }),
      ),
    );
  });
});

it("keeps modern class creation/codes server authoritative and subject owners cannot use adviser paths", async () => {
  await seed();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(ref(db, "sparkSections/sectionA"), {
      ...section(),
      classKind: "SUBJECT",
      grade: 10,
      adviserId: "",
      subjectTeacherIds: ["teacherA"],
    });
    await setDoc(ref(db, "sparkSubjects/math"), {
      sectionId: "sectionA",
      teacherId: "teacherA",
      active: true,
      name: "Math",
      startTime: "09:00",
      endTime: "10:30",
    });
    await setDoc(ref(db, "sparkStudents/studentA"), student());
  });
  const db = dbFor();
  await assertSucceeds(getDoc(ref(db, "sparkSections/sectionA")));
  await assertSucceeds(getDoc(ref(db, "sparkStudents/studentA")));
  await assertSucceeds(
    updateDoc(ref(db, "sparkSubjects/math"), { name: "Mathematics" }),
  );
  await assertFails(
    setDoc(ref(db, "sparkStudentCodeCounters/G10-A"), { next: 2 }),
  );
  await assertFails(
    setDoc(ref(db, "sparkSections/new"), {
      ...section(),
      classKind: "ADVISORY",
      grade: 1,
      adviserId: "teacherA",
    }),
  );
  await assertFails(
    setDoc(ref(db, "sparkAttendance/" + attendanceKey), attendance()),
  );
  await assertFails(
    setDoc(ref(db, "sparkDismissals/sectionA_2026-10-09"), {
      sectionId: "sectionA",
      localSchoolDate: "2026-10-09",
      teacherId: "teacherA",
      deviceId: "teacherA",
      studentIds: ["studentA"],
      localTimestamp: "2026-10-09T08:00:00+08:00",
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(createStudent(db, { studentNumber: "G10-A-001" }));
});
