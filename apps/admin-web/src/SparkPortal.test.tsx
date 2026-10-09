// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SparkPortal } from "./SparkPortal";
const session = vi.hoisted(() => ({
  currentUser: null as any,
  notify: null as any,
}));
vi.mock("./firebase", () => ({ getFirebase: () => ({ auth: session }) }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: any, callback: any) => {
    session.notify = callback;
    callback(session.currentUser);
    return () => {};
  },
  signInWithCustomToken: vi.fn(),
  signOut: vi.fn(),
}));
let root: Root, container: HTMLDivElement;
const profile = (uid: string, role: string) => ({
  profile: { uid, email: uid + "@example.test", name: uid, role },
  school: { id: "school", name: "Test school" },
  date: "2026-10-09",
  sections: 2,
  students: 1,
  present: 0,
  absent: 0,
  unmarked: 1,
});
const setup = {
  sections: [
    {
      id: "A",
      name: "Class A",
      teacherId: "teacher",
      gradeLevelId: "grade",
      academicYearId: "year",
    },
    {
      id: "B",
      name: "Class B",
      teacherId: "teacher",
      gradeLevelId: "grade",
      academicYearId: "year",
    },
  ],
  years: [],
  grades: [],
};
const user = (uid: string) => ({ uid, getIdToken: async () => uid });
const response = (body: unknown) => ({ ok: true, json: async () => body });
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  session.currentUser = user("teacher");
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("portal obsolete response protection", () => {
  it("does not show an old administrator response after an account switch", async () => {
    const previous = deferred();
    session.currentUser = user("admin");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const { action } = JSON.parse(options.body);
        if (
          action === "overview" &&
          options.headers.Authorization === "Bearer admin"
        )
          return previous.promise;
        if (action === "overview")
          return response(profile("teacher", "TEACHER"));
        if (action === "sectionList") return response(setup);
        if (action === "studentList") return response({ students: [] });
        return response({ teachers: [], devices: [] });
      }),
    );
    await act(async () => root.render(<SparkPortal />));
    await flush();
    await act(async () => {
      session.currentUser = user("teacher");
      session.notify(session.currentUser);
    });
    await flush();
    await act(async () =>
      previous.resolve(response(profile("admin", "SCHOOL_ADMIN"))),
    );
    await flush();
    expect(container.textContent).toContain("Teacher dashboard");
    expect(container.textContent).not.toContain("Administrator dashboard");
    expect(container.textContent).not.toContain("Manage teachers");
  });
  it("does not show the old section’s parent contact in the newly selected section", async () => {
    const previous = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const input = JSON.parse(options.body);
        if (input.action === "overview")
          return response(profile("teacher", "TEACHER"));
        if (input.action === "sectionList") return response(setup);
        if (input.action === "studentList")
          return input.sectionId === "A"
            ? previous.promise
            : response({
                students: [
                  {
                    id: "b",
                    displayName: "Student B",
                    studentNumber: "B1",
                    parentName: "Parent B",
                    parentPhone: "+639171111111",
                    status: "UNMARKED",
                  },
                ],
              });
        return response({});
      }),
    );
    await act(async () => root.render(<SparkPortal />));
    await flush();
    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "My sections",
    )!;
    await act(async () => button.click());
    const select = container.querySelector("select")!;
    await act(async () => {
      select.value = "B";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    await act(async () =>
      previous.resolve(
        response({
          students: [
            {
              id: "a",
              displayName: "Student A",
              studentNumber: "A1",
              parentName: "Private parent A",
              parentPhone: "+639172222222",
              status: "UNMARKED",
            },
          ],
        }),
      ),
    );
    await flush();
    expect(container.textContent).toContain("Student B");
    expect(container.textContent).not.toContain("Private parent A");
  });
});
