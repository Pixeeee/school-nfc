import { describe, expect, it, vi } from "vitest";
import { latestNativeRollCall, createPortalHandler } from "./portal.mjs";

function response() {
  return {
    code: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(n) {
      this.code = n;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}
const member = (role = "TEACHER", status = "ACTIVE") => ({
  exists: true,
  data: () => ({ role, status }),
});
function setup(membership = member()) {
  const auth = {
    verifyIdToken: vi.fn(async () => ({
      uid: "teacherA",
      portalClient: "ANDROID",
    })),
  };
  const db = { doc: vi.fn(() => ({ get: vi.fn(async () => membership) })) };
  return {
    auth,
    db,
    handler: createPortalHandler({
      auth,
      db,
      schoolId: "schoolA",
      projectId: "demo-school-spark",
    }),
  };
}
async function call(handler, body = {}, token = "valid", method = "POST") {
  const res = response();
  await handler(
    {
      method,
      headers: { authorization: token ? "Bearer " + token : undefined },
      body,
    },
    res,
  );
  return res;
}
describe("portal trust boundaries", () => {
  it("rejects unauthenticated requests before database access", async () => {
    const s = setup();
    const r = await call(s.handler, { action: "overview" }, "");
    expect(r.code).toBe(401);
    expect(s.db.doc).not.toHaveBeenCalled();
  });
  it("rejects revoked Firebase credentials", async () => {
    const s = setup();
    s.auth.verifyIdToken.mockRejectedValue(new Error("revoked"));
    expect((await call(s.handler, { action: "overview" })).code).toBe(401);
    expect(s.auth.verifyIdToken).toHaveBeenCalledWith("valid", true);
  });
  it("rejects missing membership", async () => {
    const s = setup({ exists: false });
    expect((await call(s.handler, { action: "overview" })).code).toBe(403);
  });
  it("rejects inactive membership", async () => {
    const s = setup(member("TEACHER", "SUSPENDED"));
    expect((await call(s.handler, { action: "overview" })).code).toBe(403);
  });
  it("rejects teacher web sessions even when the school membership is active", async () => {
    const s = setup();
    s.auth.verifyIdToken.mockResolvedValue({ uid: "teacherA" });
    expect((await call(s.handler, { action: "overview" })).code).toBe(403);
  });
  it("rejects teacher account creation by a teacher", async () => {
    const s = setup();
    expect(
      (
        await call(s.handler, {
          action: "teacherCreate",
          email: "teacher@example.com",
          username: "testteacher",
          password: "test-password",
          name: "Teacher",
        })
      ).code,
    ).toBe(403);
  });
  it("rejects unsupported roles", async () => {
    const s = setup(member("STUDENT"));
    expect((await call(s.handler, { action: "overview" })).code).toBe(403);
  });
  it("allows only POST and prevents caching", async () => {
    const s = setup();
    const r = await call(s.handler, {}, "valid", "GET");
    expect(r.code).toBe(405);
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
  it("rejects unknown operations", async () => {
    const s = setup();
    expect((await call(s.handler, { action: "makeAdmin" })).code).toBe(400);
  });
  it("rejects client-specified school or role", async () => {
    const s = setup(member("SCHOOL_ADMIN"));
    expect(
      (
        await call(s.handler, {
          action: "teacherCreate",
          schoolId: "other",
          role: "SCHOOL_ADMIN",
          email: "teacher@example.com",
          username: "testteacher",
          password: "test-password",
          name: "Teacher",
        })
      ).code,
    ).toBe(400);
  });
  it("uses generic errors for invalid login identifiers", async () => {
    const s = setup();
    const r = await call(s.handler, {
      action: "login",
      identifier: "../private",
      password: "bad",
    });
    expect(r.code).toBe(401);
    expect(r.body.error).toBe("Incorrect username or password.");
  });
});

it("uses the latest native Present/Absent change for each student", () => {
  const records = [
    {
      studentId: "a",
      eventType: "ARRIVAL",
      localTimestamp: "2026-10-12T08:00:00Z",
    },
    {
      studentId: "a",
      eventType: "ABSENT",
      localTimestamp: "2026-10-12T08:01:00Z",
    },
  ];
  expect(latestNativeRollCall(records)[0].status).toBe("ABSENT");
  expect(
    latestNativeRollCall([
      ...records,
      {
        studentId: "a",
        eventType: "ARRIVAL",
        localTimestamp: "2026-10-12T08:02:00Z",
      },
    ])[0].status,
  ).toBe("PRESENT");
});
it("keeps independent latest subject tags for the same student/day", () => {
  const records = [
    {
      studentId: "a",
      subjectId: "math",
      attendanceTag: "ON_TIME",
      eventType: "ARRIVAL",
      localTimestamp: "2026-10-12T08:00:00Z",
    },
    {
      studentId: "a",
      subjectId: "science",
      attendanceTag: "ABSENT",
      eventType: "ABSENT",
      localTimestamp: "2026-10-12T09:00:00Z",
    },
    {
      studentId: "a",
      subjectId: "math",
      attendanceTag: "LATE",
      eventType: "ARRIVAL",
      localTimestamp: "2026-10-12T08:05:00Z",
    },
  ];
  expect(
    latestNativeRollCall(records)
      .map((x) => [x.subjectId, x.status])
      .sort(),
  ).toEqual([
    ["math", "LATE"],
    ["science", "ABSENT"],
  ]);
});

describe("teacher configuration authorization", () => {
  it.each([
    "sectionAssign",
    "subjectSet",
    "sectionCreate",
    "studentCreate",
    "attendanceSet",
    "deviceSet",
  ])("rejects administrator %s before any mutation", async (action) => {
    const s = setup(member("SCHOOL_ADMIN"));
    expect((await call(s.handler, { action })).code).toBe(403);
    expect(s.db.doc).toHaveBeenCalledTimes(1);
  });
  function configuration(
    section,
    target = member(),
    subjects = [],
    actor = member(),
  ) {
    const auth = {
      verifyIdToken: vi.fn(async () => ({
        uid: "teacherA",
        portalClient: "ANDROID",
      })),
    };
    const snapshot = (data) => ({ exists: !!data, data: () => data });
    const tx = {
      get: vi.fn(async (ref) =>
        ref.path?.endsWith("/members/teacherA")
          ? actor
          : ref.path?.includes("/members/")
            ? target
            : ref.path?.includes("/sparkSections/")
              ? snapshot(section)
              : ref.path?.includes("/sparkSubjects/")
                ? { exists: false }
                : { docs: subjects },
      ),
      update: vi.fn(),
      set: vi.fn(),
    };
    const query = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(async () => ({ docs: [] })),
    };
    const db = {
      doc: vi.fn((path) => ({
        path,
        get: async () =>
          path.endsWith("/members/teacherA")
            ? member()
            : snapshot({ status: "ACTIVE" }),
      })),
      collection: vi.fn(() => query),
      runTransaction: vi.fn(async (fn) => fn(tx)),
    };
    return {
      tx,
      query,
      handler: createPortalHandler({ auth, db, schoolId: "schoolA" }),
    };
  }
  const fields = {
    action: "subjectSet",
    sectionId: "shared",
    subjectId: "math",
    teacherId: "teacherB",
    name: "Math",
    startTime: "08:00",
    endTime: "09:00",
  };
  it("checks current adviser inside the write transaction and cannot seize another class", async () => {
    const s = configuration({
      active: true,
      teacherId: "teacherA",
      adviserId: "teacherB",
    });
    expect(
      (
        await call(s.handler, {
          action: "sectionAssign",
          sectionId: "shared",
          adviserId: "teacherA",
        })
      ).code,
    ).toBe(403);
    expect(s.tx.update).not.toHaveBeenCalled();
  });
  it("rejects inactive assignees without changing subjects or roster access", async () => {
    const s = configuration(
      { active: true, adviserId: "teacherA" },
      member("TEACHER", "SUSPENDED"),
    );
    expect((await call(s.handler, fields)).code).toBe(400);
    expect(s.tx.set).not.toHaveBeenCalled();
    expect(s.tx.update).not.toHaveBeenCalled();
  });
  it.each([
    member("TEACHER", "SUSPENDED"),
    member("SCHOOL_ADMIN"),
    { exists: false },
  ])(
    "rejects a membership revoked after initial authentication before assignment writes",
    async (actor) => {
      const s = configuration(
        { active: true, adviserId: "teacherA" },
        member(),
        [],
        actor,
      );
      expect((await call(s.handler, fields)).code).toBe(403);
      expect(s.tx.get).toHaveBeenCalledTimes(1);
      expect(s.tx.get).toHaveBeenCalledWith(
        expect.objectContaining({ path: "schools/schoolA/members/teacherA" }),
      );
      expect(s.tx.set).not.toHaveBeenCalled();
      expect(s.tx.update).not.toHaveBeenCalled();
    },
  );
  it("updates the subject and shared section access together", async () => {
    const s = configuration({ active: true, adviserId: "teacherA" }, member(), [
      { id: "science", data: () => ({ teacherId: "teacherC", active: true }) },
    ]);
    expect((await call(s.handler, fields)).code).toBe(200);
    expect(s.tx.set).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining("/sparkSubjects/math"),
      }),
      expect.objectContaining({ teacherId: "teacherB", sectionId: "shared" }),
      { merge: true },
    );
    expect(s.tx.update).toHaveBeenCalledWith(expect.anything(), {
      subjectTeacherIds: ["teacherB", "teacherC"],
    });
  });
  it("returns only safe directory fields", async () => {
    const s = configuration({});
    s.query.get.mockResolvedValue({
      docs: [
        {
          id: "teacherB",
          data: () => ({
            displayName: "Teacher B",
            username: "teacher_b",
            email: "private@example.test",
            password: "secret",
            role: "TEACHER",
            status: "ACTIVE",
          }),
        },
      ],
    });
    const r = await call(s.handler, { action: "activeTeacherDirectory" });
    expect(r.code).toBe(200);
    expect(r.body).toEqual({
      teachers: [{ id: "teacherB", name: "Teacher B", username: "teacher_b" }],
    });
    expect(s.query.where).toHaveBeenCalledWith("status", "==", "ACTIVE");
  });
});
