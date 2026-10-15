import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPortalHandler, schoolDate } from "./portal.mjs";

const enabled =
  !!process.env.FIRESTORE_EMULATOR_HOST &&
  !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
describe.runIf(enabled)("portal real Firebase emulator integration", () => {
  let app, db, auth, handler;
  const schoolId = "portal-test-" + randomUUID();
  const base = "schools/" + schoolId;
  function response() {
    return {
      code: 200,
      setHeader() {},
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
  }
  async function call(action, fields = {}, uid = "teacherA") {
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer " + uid },
        body: { action, ...fields },
      },
      res,
    );
    return res;
  }
  beforeAll(async () => {
    app = initializeApp(
      { projectId: "demo-school-portal" },
      "portal-integration-" + randomUUID(),
    );
    db = getFirestore(app);
    auth = getAuth(app);
    await db
      .doc(base)
      .set({ name: "Test school", status: "ACTIVE", timeZone: "Asia/Manila" });
    for (const [uid, role] of [
      ["adminA", "SCHOOL_ADMIN"],
      ["teacherA", "TEACHER"],
      ["teacherB", "TEACHER"],
    ])
      await db.doc(base + "/members/" + uid).set({ role, status: "ACTIVE" });
    await db
      .doc(base + "/academicYears/current")
      .set({ name: "2026–2027", active: true });
    await db
      .doc(base + "/gradeLevels/initial")
      .set({ name: "Grade 7", active: true });
    for (const teacher of ["teacherA", "teacherB"])
      await db
        .doc(base + "/sparkSections/" + teacher)
        .set({ name: teacher, teacherId: teacher, active: true });
    const boundaryAuth = {
      verifyIdToken: async (uid) => ({
        uid,
        email: uid + "@example.test",
        portalClient: "ANDROID",
      }),
      createUser: (input) => auth.createUser(input),
      updateUser: (uid, input) => auth.updateUser(uid, input),
      deleteUser: (uid) => auth.deleteUser(uid),
    };
    handler = createPortalHandler({
      auth: boundaryAuth,
      db,
      schoolId,
      projectId: "demo-school-portal",
    });
  });
  it("edits and archives only owned roster records, preserving codes and history", async () => {
    const studentId = randomUUID();
    const fields = {
      requestId: studentId,
      sectionId: "teacherA",
      studentNumber: "EDIT-001",
      firstName: "Ada",
      lastName: "De la Cruz",
      parentName: "Demo Parent",
      parentPhone: "09171234567",
      parentPhoneVerified: true,
      parentConsent: true,
    };
    expect((await call("studentCreate", fields)).code).toBe(200);
    const changes = {
      studentId,
      sectionId: "teacherA",
      firstName: "Zoe",
      lastName: "De la Cruz",
      parentName: "New Parent",
      parentPhone: "09181234567",
      parentPhoneVerified: true,
      parentConsent: true,
    };
    expect((await call("studentUpdate", changes, "teacherB")).code).toBe(403);
    expect(
      (
        await call(
          "studentGet",
          { studentId, sectionId: "teacherA" },
          "teacherB",
        )
      ).code,
    ).toBe(403);
    expect((await call("studentUpdate", changes)).code).toBe(200);
    const read = await call("studentGet", { studentId, sectionId: "teacherA" });
    expect(read.body.student).toMatchObject({
      firstName: "Zoe",
      lastName: "De la Cruz",
      studentNumber: "EDIT-001",
      parentPhone: "+639181234567",
    });
    expect(
      (await call("studentUpdate", { ...changes, parentPhone: "bad" })).code,
    ).toBe(400);
    expect(
      (
        await call(
          "studentDelete",
          { studentId, sectionId: "teacherA" },
          "teacherB",
        )
      ).code,
    ).toBe(403);
    expect(
      (await call("studentDelete", { studentId, sectionId: "teacherA" })).code,
    ).toBe(200);
    const saved = (
      await db.doc(`${base}/sparkStudents/${studentId}`).get()
    ).data();
    expect(saved.status).toBe("ARCHIVED");
    expect(saved.studentNumber).toBe("EDIT-001");
    expect(
      (await db.doc(`${base}/sparkStudentNumbers/EDIT-001`).get()).exists,
    ).toBe(true);
    expect(
      (await call("studentDelete", { studentId, sectionId: "teacherA" })).code,
    ).toBe(200);
  });
  it("monthly reports count latest statuses per day and subject, scoped to this teacher", async () => {
    const month = "2026-09";
    const records = [
      [
        "report1",
        "teacherA",
        "2026-09-02",
        "2026-09-02T01:00:00Z",
        "ABSENT",
        "",
      ],
      [
        "report2",
        "teacherA",
        "2026-09-02",
        "2026-09-02T01:00:00.001Z",
        "LATE",
        "",
      ],
      [
        "report3",
        "teacherA",
        "2026-09-02",
        "2026-09-02T01:11:00Z",
        "ON_TIME",
        "math",
      ],
      [
        "report4",
        "teacherB",
        "2026-09-02",
        "2026-09-02T01:12:00Z",
        "ABSENT",
        "",
      ],
      [
        "report5",
        "teacherA",
        "2026-10-02",
        "2026-10-02T01:12:00Z",
        "ABSENT",
        "",
      ],
    ];
    for (const [
      id,
      teacherId,
      localSchoolDate,
      localTimestamp,
      attendanceTag,
      subjectId,
    ] of records)
      await db.doc(`${base}/sparkAttendance/${id}`).set({
        teacherId,
        sectionId: "teacherA",
        studentId: "reportStudent",
        localSchoolDate,
        localTimestamp,
        attendanceTag,
        subjectId,
        eventType: attendanceTag === "ABSENT" ? "ABSENT" : "ARRIVAL",
      });
    const result = await call("teacherReport", { month });
    expect(result.code).toBe(200);
    expect(result.body.totals).toEqual({
      onTime: 1,
      late: 1,
      absent: 0,
      recorded: 2,
    });
    expect(result.body.rows).toHaveLength(2);
    expect(
      (await call("teacherReport", { month, teacherId: "teacherB" })).code,
    ).toBe(400);
    expect((await call("teacherReport", { month: "2026-13" })).code).toBe(400);
  });
  afterAll(async () => {
    await db.recursiveDelete(db.doc(base));
    await deleteApp(app);
  });
  it("creates advisory/subject classes and allocates codes atomically across concurrent requests and retries", async () => {
    const roleSchoolId = schoolId + "-roles";
    const base = "schools/" + roleSchoolId;
    await db.doc(base).set({ status: "ACTIVE", timeZone: "Asia/Manila" });
    for (const uid of ["teacherA", "teacherB"])
      await db
        .doc(`${base}/members/${uid}`)
        .set({ role: "TEACHER", status: "ACTIVE" });
    const roleHandler = createPortalHandler({
      auth: {
        verifyIdToken: async (uid) => ({ uid, portalClient: "ANDROID" }),
      },
      db,
      schoolId: roleSchoolId,
    });
    async function call(action, fields, uid = "teacherA") {
      const res = response();
      await roleHandler(
        {
          method: "POST",
          headers: { authorization: "Bearer " + uid },
          body: { action, ...fields },
        },
        res,
      );
      return res;
    }
    try {
      const sectionId = randomUUID();
      const fields = {
        requestId: sectionId,
        name: "Nara",
        grade: 10,
        classKind: "SUBJECT",
        subjectName: "Math",
        startTime: "09:00",
        endTime: "10:30",
      };
      expect((await call("sectionCreate", fields)).code).toBe(200);
      const section = (
        await db.doc(`${base}/sparkSections/${sectionId}`).get()
      ).data();
      expect(section).toMatchObject({
        adviserId: "",
        teacherId: "teacherA",
        subjectTeacherIds: ["teacherA"],
        grade: 10,
        classKind: "SUBJECT",
      });
      expect(
        (await db.doc(`${base}/sparkSubjects/${sectionId}`).get()).data(),
      ).toMatchObject({
        teacherId: "teacherA",
        sectionId,
        name: "Math",
        startTime: "09:00",
        endTime: "10:30",
      });
      expect(
        (await call("sectionCreate", { ...fields, subjectName: "English" }))
          .code,
      ).toBe(409);
      expect(
        (await call("sectionAssign", { sectionId, adviserId: "teacherB" }))
          .code,
      ).toBe(403);
      expect(
        (
          await call("subjectSet", {
            sectionId,
            subjectId: randomUUID(),
            teacherId: "teacherB",
            name: "Other",
            startTime: "09:00",
            endTime: "10:00",
          })
        ).code,
      ).toBe(403);
      await db
        .doc(`${base}/sparkStudentNumbers/G10-NARA-001`)
        .set({ studentId: "legacy", sectionId: "legacy" });
      const student = {
        sectionId,
        firstName: "Test",
        lastName: "Only",
        parentName: "Test Parent",
        parentPhone: "09171234567",
        parentPhoneVerified: true,
        parentConsent: true,
      };
      const requests = Array.from({ length: 6 }, () => ({
        ...student,
        requestId: randomUUID(),
      }));
      const results = await Promise.all(
        requests.map((x) => call("studentCreate", x)),
      );
      expect(results.map((x) => x.code)).toEqual(Array(6).fill(200));
      expect(new Set(results.map((x) => x.body.studentNumber)).size).toBe(6);
      expect(results.map((x) => x.body.studentNumber).sort()).toEqual(
        Array.from(
          { length: 6 },
          (_, i) => `G10-NARA-${String(i + 2).padStart(3, "0")}`,
        ),
      );
      expect(
        (await call("studentCreate", requests[0])).body.studentNumber,
      ).toBe(results[0].body.studentNumber);
      expect(
        (
          await call("studentCreate", {
            ...requests[0],
            parentName: "Different",
          })
        ).code,
      ).toBe(409);
      expect(
        (
          await call(
            "studentCreate",
            { ...student, requestId: randomUUID() },
            "teacherB",
          )
        ).code,
      ).toBe(403);
      const otherClass = randomUUID();
      expect(
        (
          await call(
            "sectionCreate",
            { ...fields, requestId: otherClass },
            "teacherB",
          )
        ).code,
      ).toBe(200);
      const otherStudent = await call(
        "studentCreate",
        { ...student, sectionId: otherClass, requestId: randomUUID() },
        "teacherB",
      );
      expect(otherStudent.body.studentNumber).toBe("G10-NARA-008");
      const blockedId = randomUUID();
      await db
        .doc(`${base}/sparkSubjects/${blockedId}`)
        .set({ sectionId: "another", teacherId: "teacherB", active: true });
      expect(
        (await call("sectionCreate", { ...fields, requestId: blockedId })).code,
      ).toBe(409);
      expect(
        (await db.doc(`${base}/sparkSections/${blockedId}`).get()).exists,
      ).toBe(false);
      await db
        .doc(`${base}/sparkSections/${sectionId}`)
        .update({ active: false });
      expect(
        (await call("studentCreate", { ...student, requestId: randomUUID() }))
          .code,
      ).toBe(403);
      await db
        .doc(`${base}/sparkSections/${sectionId}`)
        .update({ active: true });
      const legacyId = randomUUID();
      await db
        .doc(`${base}/gradeLevels/initial`)
        .set({ name: "All grades", active: true });
      await db.doc(`${base}/sparkSections/${legacyId}`).set({
        name: "Legacy Nara",
        gradeLevelId: "initial",
        teacherId: "teacherA",
        active: true,
      });
      const legacyRequest = {
        ...student,
        sectionId: legacyId,
        requestId: randomUUID(),
        grade: 10,
      };
      expect(
        (await call("studentCreate", { ...legacyRequest, grade: 13 })).code,
      ).toBe(400);
      expect(
        (await call("studentCreate", legacyRequest, "teacherB")).code,
      ).toBe(403);
      const legacyStudent = await call("studentCreate", legacyRequest);
      expect(legacyStudent.code).toBe(200);
      expect(legacyStudent.body.studentNumber).toBe("G10-LEGACY-NARA-001");
      expect(
        (await db.doc(`${base}/sparkSections/${legacyId}`).get()).data(),
      ).toMatchObject({ grade: 10, gradeLevelId: "initial" });
      expect(
        (await call("studentCreate", legacyRequest)).body.studentNumber,
      ).toBe(legacyStudent.body.studentNumber);
      expect(
        (
          await call("studentCreate", {
            ...legacyRequest,
            requestId: randomUUID(),
            grade: 11,
          })
        ).code,
      ).toBe(409);
      expect(
        (await db.doc(`${base}/sparkSections/${legacyId}`).get()).data().grade,
      ).toBe(10);
      for (const grade of [1, 12]) {
        const r = await call("sectionCreate", {
          requestId: randomUUID(),
          name: "Advisory",
          classKind: "ADVISORY",
          grade,
        });
        expect(r.code).toBe(200);
        expect(
          (await db.doc(`${base}/sparkSections/${r.body.id}`).get()).data(),
        ).toMatchObject({
          grade,
          adviserId: "teacherA",
          classKind: "ADVISORY",
        });
      }
      for (const grade of [0, 13, 1.5])
        expect(
          (
            await call("sectionCreate", {
              requestId: randomUUID(),
              name: "Bad",
              classKind: "ADVISORY",
              grade,
            })
          ).code,
        ).toBe(400);
      const invalidId = randomUUID();
      expect(
        (
          await call("sectionCreate", {
            ...fields,
            requestId: invalidId,
            endTime: "08:59",
          })
        ).code,
      ).toBe(400);
      expect(
        (await db.doc(`${base}/sparkSections/${invalidId}`).get()).exists,
      ).toBe(false);
      expect(
        (await db.doc(`${base}/sparkSubjects/${invalidId}`).get()).exists,
      ).toBe(false);
      await db
        .doc(`${base}/members/suspended`)
        .set({ role: "TEACHER", status: "SUSPENDED" });
      expect(
        (
          await call(
            "sectionCreate",
            { ...fields, requestId: randomUUID() },
            "suspended",
          )
        ).code,
      ).toBe(403);
      expect(
        (
          await call(
            "studentCreate",
            { ...student, requestId: randomUUID() },
            "suspended",
          )
        ).code,
      ).toBe(403);
    } finally {
      await db.recursiveDelete(db.doc(base));
    }
  }, 30000);
  it("creates a teacher account and membership without storing a password", async () => {
    const email = randomUUID() + "@example.test";
    const username = "teacher_" + randomUUID().slice(0, 8);
    const r = await call(
      "teacherCreate",
      { email, username, password: "test-only-password", name: "Test teacher" },
      "adminA",
    );
    expect(r.code).toBe(200);
    const member = (await db.doc(base + "/members/" + r.body.uid).get()).data();
    expect(member.role).toBe("TEACHER");
    expect(member.username).toBe(username);
    expect((await db.doc("loginNames/" + username).get()).data().uid).toBe(
      r.body.uid,
    );
    const collision = await call(
      "teacherCreate",
      {
        email: randomUUID() + "@example.test",
        username,
        password: "test-only-password",
        name: "Another teacher",
      },
      "adminA",
    );
    expect(collision.code).toBe(409);
    expect((await db.doc("loginNames/" + username).get()).data().uid).toBe(
      r.body.uid,
    );
    await db.doc("loginNames/" + username).delete();
    expect(member.password).toBeUndefined();
    expect((await auth.getUser(r.body.uid)).disabled).toBe(false);
    await auth.deleteUser(r.body.uid);
  });
  it("issues teacher credentials once and allows Android login while denying the web dashboard", async () => {
    const username = "mobile_" + randomUUID().slice(0, 8);
    const r = await call(
      "teacherCreate",
      { username, name: "Mobile teacher" },
      "adminA",
    );
    expect(r.code).toBe(200);
    expect(r.body.password).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(
      (await db.doc(base + "/members/" + r.body.uid).get()).data().password,
    ).toBeUndefined();
    expect(
      (await db.doc("loginNames/" + username).get()).data().password,
    ).toBeUndefined();
    const createCustomToken = vi.fn(async () => "custom-token");
    const h = createPortalHandler({
      db,
      schoolId,
      apiKey: "emulator-key",
      auth: {
        verifyIdToken: (...args) => auth.verifyIdToken(...args),
        createCustomToken,
      },
      fetchImpl: (_url, options) =>
        fetch(
          "http://" +
            process.env.FIREBASE_AUTH_EMULATOR_HOST +
            "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key",
          options,
        ),
    });
    const login = async (client) => {
      const res = response();
      await h(
        {
          method: "POST",
          headers: {},
          body: {
            action: "login",
            identifier: username,
            password: r.body.password,
            client,
          },
        },
        res,
      );
      return res;
    };
    expect((await login("WEB")).code).toBe(401);
    expect(createCustomToken).not.toHaveBeenCalled();
    expect((await login("ANDROID")).code).toBe(200);
    expect(createCustomToken).toHaveBeenCalledWith(r.body.uid, {
      portalClient: "ANDROID",
    });
    await auth.deleteUser(r.body.uid);
    await db.doc("loginNames/" + username).delete();
  });
  it("rejects creating sections with inactive academic choices", async () => {
    const r = await call("sectionCreate", {
      requestId: randomUUID(),
      name: "Class A",
      academicYearId: "missing",
      gradeLevelId: "initial",
    });
    expect(r.code).toBe(400);
  });
  it("creates sections once for a replayed request", async () => {
    const requestId = randomUUID();
    const fields = {
      requestId,
      name: "Class A",
      academicYearId: "current",
      gradeLevelId: "initial",
    };
    expect((await call("sectionCreate", fields)).code).toBe(200);
    expect((await call("sectionCreate", fields)).body.id).toBe(requestId);
    expect(
      (await db.doc(base + "/sparkSections/" + requestId).get()).data()
        .teacherId,
    ).toBe("teacherA");
  });
  it("blocks cross-teacher section access", async () => {
    expect(
      (await call("studentList", { sectionId: "teacherB", date: schoolDate() }))
        .code,
    ).toBe(403);
  });
  const requestId = randomUUID();
  const student = {
    requestId,
    sectionId: "teacherA",
    studentNumber: "abc001",
    firstName: "Ada",
    lastName: "Cruz",
    parentName: "Parent",
    parentPhone: "09171234567",
    parentPhoneVerified: true,
    parentConsent: true,
  };
  it("atomically stores a student and normalizes parent contact", async () => {
    const r = await call("studentCreate", student);
    expect(r.code).toBe(200);
    const record = (
      await db.doc(base + "/sparkStudents/" + requestId).get()
    ).data();
    expect(record.parentPhone).toBe("+639171234567");
    expect(record.studentNumber).toBe("ABC001");
    expect(
      (await db.doc(base + "/sparkStudentNumbers/ABC001").get()).data(),
    ).toEqual({ studentId: requestId, sectionId: "teacherA" });
    expect((await call("studentCreate", student)).body.id).toBe(requestId);
  });
  it("rejects duplicate student numbers without a partial student", async () => {
    const next = randomUUID();
    expect(
      (await call("studentCreate", { ...student, requestId: next })).code,
    ).toBe(409);
    expect((await db.doc(base + "/sparkStudents/" + next).get()).exists).toBe(
      false,
    );
  });
  it("blocks missing consent and invalid phone numbers", async () => {
    expect(
      (
        await call("studentCreate", {
          ...student,
          requestId: randomUUID(),
          parentConsent: false,
        })
      ).code,
    ).toBe(400);
    expect(
      (
        await call("studentCreate", {
          ...student,
          requestId: randomUUID(),
          parentPhone: "123",
        })
      ).code,
    ).toBe(400);
  });
  it("keeps students unmarked until an explicit decision", async () => {
    const r = await call("studentList", {
      sectionId: "teacherA",
      date: schoolDate(),
    });
    expect(r.body.students.find((s) => s.id === requestId).status).toBe(
      "UNMARKED",
    );
  });
  it("records explicit Present then Absent and keeps audit evidence", async () => {
    const fields = {
      sectionId: "teacherA",
      studentId: requestId,
      date: schoolDate(),
    };
    const presentId = randomUUID();
    expect(
      (
        await call("attendanceSet", {
          ...fields,
          requestId: presentId,
          status: "PRESENT",
        })
      ).body.smsSent,
    ).toBe(false);
    const absenceId = randomUUID();
    expect(
      (
        await call("attendanceSet", {
          ...fields,
          requestId: absenceId,
          status: "ABSENT",
        })
      ).code,
    ).toBe(200);
    const daily = (
      await db
        .doc(base + "/sparkRollCall/" + requestId + "_" + schoolDate())
        .get()
    ).data();
    expect(daily.status).toBe("ABSENT");
    expect(
      (await db.doc(base + "/sparkRollCallAudit/" + absenceId).get()).data()
        .previousStatus,
    ).toBe("PRESENT");
    expect(
      (
        await call("attendanceSet", {
          ...fields,
          requestId: absenceId,
          status: "ABSENT",
        })
      ).code,
    ).toBe(200);
  });
  it("blocks marking another teacher’s student", async () => {
    expect(
      (
        await call(
          "attendanceSet",
          {
            sectionId: "teacherA",
            studentId: requestId,
            date: schoolDate(),
            status: "PRESENT",
            requestId: randomUUID(),
          },
          "teacherB",
        )
      ).code,
    ).toBe(403);
  });
  it("rejects yesterday's displayed date without writing today", async () => {
    const auditId = randomUUID();
    const r = await call("attendanceSet", {
      sectionId: "teacherA",
      studentId: requestId,
      date: "2000-01-01",
      status: "PRESENT",
      requestId: auditId,
    });
    expect(r.code).toBe(409);
    expect(
      (await db.doc(base + "/sparkRollCallAudit/" + auditId).get()).exists,
    ).toBe(false);
  });
  it("rolls back a newly created teacher after provisioning failure", async () => {
    const address = randomUUID() + "@example.test";
    let createdId;
    const broken = createPortalHandler({
      db,
      schoolId,
      auth: {
        verifyIdToken: async () => ({ uid: "adminA" }),
        createUser: async (input) => {
          const u = await auth.createUser(input);
          createdId = u.uid;
          return u;
        },
        updateUser: async (uid, fields) => {
          if (fields.disabled === false) throw new Error("temporary failure");
          return auth.updateUser(uid, fields);
        },
        deleteUser: (uid) => auth.deleteUser(uid),
      },
    });
    const res = response();
    await broken(
      {
        method: "POST",
        headers: { authorization: "Bearer adminA" },
        body: {
          action: "teacherCreate",
          email: address,
          username: "rollback_" + address.slice(0, 8),
          password: "test-only-password",
          name: "Test teacher",
        },
      },
      res,
    );
    expect(res.code).toBe(500);
    await expect(auth.getUserByEmail(address)).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
    expect(
      (await db.doc("loginNames/rollback_" + address.slice(0, 8)).get()).exists,
    ).toBe(false);
    expect((await db.doc(base + "/members/" + createdId).get()).exists).toBe(
      false,
    );
  });
  it("summarizes explicit attendance and excludes unmarked from absent", async () => {
    const r = await call("overview");
    expect(r.code).toBe(200);
    expect(r.body.absent).toBe(1);
    expect(r.body.present).toBe(0);
    expect(r.body.students).toBe(1);
  });
  it("rejects administrator device mutation without changing the device", async () => {
    await db
      .doc(base + "/sparkDevices/deviceA")
      .set({ assignedUserId: "teacherA", status: "PENDING" });
    expect(
      (
        await call(
          "deviceSet",
          { deviceId: "deviceA", teacherId: "teacherA", status: "APPROVED" },
          "adminA",
        )
      ).code,
    ).toBe(403);
    expect(
      (await db.doc(base + "/sparkDevices/deviceA").get()).data().status,
    ).toBe("PENDING");
  });
  it("uses generic errors and denies an authenticated nonmember in username login", async () => {
    await db.doc("loginNames/testportal").set({ email: "test@example.test" });
    const h = createPortalHandler({
      auth: { verifyIdToken: vi.fn(async () => ({ uid: "outsider" })) },
      db,
      schoolId,
      apiKey: "emulator-only",
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({ idToken: "fake" }),
      })),
    });
    const res = response();
    await h(
      {
        method: "POST",
        headers: {},
        body: {
          action: "login",
          identifier: "testportal",
          password: "test-only",
        },
      },
      res,
    );
    expect(res.code).toBe(401);
    expect(res.body.error).toBe("Incorrect username or password.");
    await db.doc("loginNames/testportal").delete();
  });
  it("bootstraps an enabled admin and refuses to overwrite its credentials", async () => {
    const username =
      "bootstrap_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const bootstrapSchool = "bootstrap-" + randomUUID();
    const email = username + "@example.test";
    const script = fileURLToPath(
      new URL("../../../scripts/provision-portal-admin.mjs", import.meta.url),
    );
    const args = [
      script,
      "demo-school-portal",
      bootstrapSchool,
      username,
      email,
      "Test admin",
    ];
    const result = spawnSync(process.execPath, args, {
      env: process.env,
      input: JSON.stringify({ password: "Emulator-test-123" }),
      encoding: "utf8",
      timeout: 20000,
    });
    expect(result.status, result.stderr).toBe(0);
    const user = await auth.getUserByEmail(email);
    expect(user.disabled).toBe(false);
    expect(
      (
        await db
          .doc("schools/" + bootstrapSchool + "/members/" + user.uid)
          .get()
      ).data().role,
    ).toBe("SCHOOL_ADMIN");
    expect((await db.doc("loginNames/" + username).get()).data().uid).toBe(
      user.uid,
    );
    const repeat = spawnSync(process.execPath, args, {
      env: process.env,
      input: JSON.stringify({ password: "Replacement-test-123" }),
      encoding: "utf8",
      timeout: 20000,
    });
    expect(repeat.status).not.toBe(0);
    expect(repeat.stderr).toContain("already exists");
    await auth.deleteUser(user.uid);
    await db.doc("loginNames/" + username).delete();
    await db.recursiveDelete(db.doc("schools/" + bootstrapSchool));
  }, 15000);
  it("assigns adviser and subjects only through current Android adviser, preserving creator and roster", async () => {
    const sectionId = "assigned-" + randomUUID();
    await db
      .doc(`${base}/sparkSections/${sectionId}`)
      .set({ name: "Shared", teacherId: "teacherA", active: true });
    expect(
      (
        await call(
          "sectionAssign",
          { sectionId, adviserId: "teacherB" },
          "adminA",
        )
      ).code,
    ).toBe(403);
    expect(
      (
        await call(
          "sectionAssign",
          { sectionId, adviserId: "missing" },
          "teacherA",
        )
      ).code,
    ).toBe(400);
    expect(
      (
        await call(
          "sectionAssign",
          { sectionId, adviserId: "teacherB" },
          "teacherA",
        )
      ).code,
    ).toBe(200);
    const subjectId = randomUUID();
    const fields = {
      subjectId,
      sectionId,
      teacherId: "teacherA",
      name: "Math",
      startTime: "08:00",
      endTime: "09:00",
    };
    expect((await call("subjectSet", fields)).code).toBe(403);
    expect(
      (await call("subjectSet", { ...fields, endTime: "07:00" }, "teacherB"))
        .code,
    ).toBe(400);
    expect((await call("subjectSet", fields, "teacherB")).code).toBe(200);
    let section = (
      await db.doc(`${base}/sparkSections/${sectionId}`).get()
    ).data();
    expect(section.teacherId).toBe("teacherA");
    expect(section.adviserId).toBe("teacherB");
    expect(section.subjectTeacherIds).toEqual(["teacherA"]);
    expect(
      (
        await call(
          "subjectSet",
          { ...fields, teacherId: "teacherB" },
          "teacherB",
        )
      ).code,
    ).toBe(200);
    section = (await db.doc(`${base}/sparkSections/${sectionId}`).get()).data();
    expect(section.subjectTeacherIds).toEqual(["teacherB"]);
    expect(
      (await call("sectionList", {}, "adminA")).body.subjects.some(
        (s) => s.id === subjectId,
      ),
    ).toBe(true);
  });
  it("preserves student identity when displaying native attendance", async () => {
    const studentId = randomUUID();
    expect(
      (
        await call("studentCreate", {
          ...student,
          requestId: studentId,
          studentNumber: "native001",
        })
      ).code,
    ).toBe(200);
    await db.doc(`${base}/sparkAttendance/${randomUUID()}`).set({
      studentId,
      sectionId: "teacherA",
      teacherId: "teacherB",
      eventType: "ARRIVAL",
      attendanceTag: "ON_TIME",
      localSchoolDate: schoolDate(),
      localTimestamp: new Date().toISOString(),
    });
    const result = await call(
      "studentList",
      { sectionId: "teacherA", date: schoolDate() },
      "adminA",
    );
    expect(result.code).toBe(200);
    expect(result.body.students.find((s) => s.id === studentId)).toMatchObject({
      id: studentId,
      status: "ON_TIME",
      source: "ANDROID",
    });
    expect(
      result.body.students.find((s) => s.id === studentId),
    ).not.toHaveProperty("teacherId");
  });
});
