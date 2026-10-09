import { describe, expect, it, vi } from "vitest";
import { createPortalHandler } from "./portal.mjs";

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
  const auth = { verifyIdToken: vi.fn(async () => ({ uid: "teacherA" })) };
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
