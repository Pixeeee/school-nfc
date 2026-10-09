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
      verifyIdToken: async (uid) => ({ uid, email: uid + "@example.test" }),
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
  afterAll(async () => {
    await db.recursiveDelete(db.doc(base));
    await deleteApp(app);
  });
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
  it("requires the current device owner before approval", async () => {
    await db.doc(base + "/sparkDevices/deviceA").set({
      assignedUserId: "teacherA",
      status: "PENDING",
      displayName: "Teacher phone",
      leaseExpiresAt: Timestamp.fromMillis(0),
    });
    expect(
      (
        await call(
          "deviceSet",
          { deviceId: "deviceA", teacherId: "teacherB", status: "APPROVED" },
          "adminA",
        )
      ).code,
    ).toBe(409);
    expect(
      (
        await call(
          "deviceSet",
          { deviceId: "deviceA", teacherId: "teacherA", status: "APPROVED" },
          "adminA",
        )
      ).code,
    ).toBe(200);
    expect(
      (await db.doc(base + "/sparkDevices/deviceA").get())
        .data()
        .leaseExpiresAt.toMillis(),
    ).toBeGreaterThan(Date.now());
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
  });
});
