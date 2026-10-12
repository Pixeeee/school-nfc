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
        return response({ teachers: [], attendance: [] });
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
    expect(container.textContent).toContain(
      "This dashboard is for the school administrator only",
    );
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
          return response(profile("teacher", "SCHOOL_ADMIN"));
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
        return response({ teachers: [], attendance: [] });
      }),
    );
    await act(async () => root.render(<SparkPortal />));
    await flush();
    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Sections & students",
    )!;
    await act(async () => button.click());
    const select = Array.from(container.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.value === "B"),
    )!;
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
  it("shows newly issued credentials once and clears them when leaving Teachers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const input = JSON.parse(options.body);
        if (input.action === "overview")
          return response(profile("admin", "SCHOOL_ADMIN"));
        if (input.action === "sectionList") return response(setup);
        if (input.action === "teacherCreate")
          return response({
            username: "teacher_new",
            password: "Generated-Test-Password",
          });
        return response({ teachers: [], attendance: [], students: [] });
      }),
    );
    await act(async () => root.render(<SparkPortal />));
    await flush();
    const teachers = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Teachers",
    )!;
    await act(async () => teachers.click());
    container.querySelector<HTMLInputElement>('input[name="name"]')!.value =
      "Teacher New";
    container.querySelector<HTMLInputElement>('input[name="username"]')!.value =
      "teacher_new";
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    await flush();
    expect(container.textContent).toContain("Generated-Test-Password");
    const overview = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Overview",
    )!;
    await act(async () => overview.click());
    await flush();
    await act(async () => teachers.click());
    await flush();
    expect(container.textContent).not.toContain("Generated-Test-Password");
  });
  it("filters subject teacher attendance only within that teacher's assigned section", async () => {
    session.currentUser = user("admin");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const input = JSON.parse(options.body);
        if (input.action === "overview")
          return response(profile("admin", "SCHOOL_ADMIN"));
        if (input.action === "sectionList")
          return response({
            ...setup,
            sections: [
              {
                ...setup.sections[0],
                teacherId: "adviserA",
                subjectTeacherIds: ["subjectTeacher"],
              },
              {
                ...setup.sections[1],
                teacherId: "adviserB",
                subjectTeacherIds: [],
              },
            ],
          });
        if (input.action === "teacherList")
          return response({
            teachers: [
              {
                id: "subjectTeacher",
                displayName: "Subject teacher",
                email: "subject@example.test",
                status: "ACTIVE",
              },
            ],
          });
        if (input.action === "attendanceList")
          return response({
            attendance: [
              {
                id: "recordA",
                teacherId: "subjectTeacher",
                studentId: "studentA",
                studentName: "Assigned student",
                sectionId: "A",
                status: "ON_TIME",
                source: "ANDROID",
              },
              {
                id: "recordB",
                teacherId: "adviserB",
                studentId: "studentB",
                studentName: "Unrelated student",
                sectionId: "B",
                status: "ABSENT",
                source: "ANDROID",
              },
            ],
          });
        return response({ students: [], devices: [] });
      }),
    );
    await act(async () => root.render(<SparkPortal />));
    await flush();
    const attendance = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Attendance",
    )!;
    await act(async () => attendance.click());
    await flush();
    expect(container.textContent).toContain("Unrelated student");
    const picker = container.querySelector("select")!;
    await act(async () => {
      picker.value = "subjectTeacher";
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(container.textContent).toContain("Assigned student");
    expect(container.textContent).not.toContain("Unrelated student");
  });
  it("shows read-only daily analytics and no class configuration or roll-call controls", async () => {
    session.currentUser = user("admin");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const input = JSON.parse(options.body);
        if (input.action === "overview")
          return response(profile("admin", "SCHOOL_ADMIN"));
        if (input.action === "sectionList")
          return response({
            ...setup,
            sections: [setup.sections[0]],
            subjects: [
              {
                id: "math",
                sectionId: "A",
                teacherId: "mathTeacher",
                name: "Math",
                startTime: "09:00",
                endTime: "10:00",
              },
              {
                id: "science",
                sectionId: "A",
                teacherId: "scienceTeacher",
                name: "Science",
                startTime: "10:00",
                endTime: "11:00",
              },
            ],
          });
        if (input.action === "studentList")
          return response({
            students: [
              {
                id: "s1",
                displayName: "One",
                studentNumber: "1",
                parentName: "Parent One",
                parentPhone: "+639171111111",
                status: "LATE",
              },
              {
                id: "s2",
                displayName: "Two",
                studentNumber: "2",
                parentName: "Parent Two",
                parentPhone: "+639172222222",
                status: "ABSENT",
              },
            ],
          });
        if (input.action === "attendanceList")
          return response({
            attendance: [
              {
                id: "a1",
                studentId: "s1",
                sectionId: "A",
                subjectId: "math",
                teacherId: "mathTeacher",
                status: "ON_TIME",
                source: "ANDROID",
              },
              {
                id: "a2",
                studentId: "s1",
                sectionId: "A",
                subjectId: "science",
                teacherId: "scienceTeacher",
                status: "LATE",
                source: "ANDROID",
              },
              {
                id: "a3",
                studentId: "s2",
                sectionId: "A",
                subjectId: "math",
                teacherId: "mathTeacher",
                status: "ABSENT",
                source: "ANDROID",
              },
            ],
          });
        return response({ teachers: [], attendance: [] });
      }),
    );
    await act(async () => root.render(<SparkPortal />));
    await flush();
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent === "Sections & students")!
        .click(),
    );
    await flush();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('input[name="name"]')).toBeNull();
    const buttons = [...container.querySelectorAll("button")].map(
      (button) => button.textContent,
    );
    for (const label of [
      "Add subject",
      "Save assignment",
      "Create section",
      "Add student",
      "Present",
      "Absent",
    ])
      expect(buttons).not.toContain(label);
    const metrics = [...container.querySelectorAll(".metric")].map((metric) => [
      metric.querySelector("span")?.textContent,
      metric.querySelector("strong")?.textContent,
    ]);
    expect(metrics).toEqual([
      ["On time", "1"],
      ["Late", "1"],
      ["Absent", "1"],
      ["Unmarked", "1"],
    ]);
    expect(container.textContent).toContain(
      "Teachers manage their classes in the Android app",
    );
  });
  it("preserves unclassified Present records without claiming an on-time arrival", async () => {
    session.currentUser = user("admin");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const input = JSON.parse(options.body);
        if (input.action === "overview")
          return response(profile("admin", "SCHOOL_ADMIN"));
        if (input.action === "sectionList")
          return response({ ...setup, sections: [setup.sections[0]] });
        if (input.action === "studentList")
          return response({
            students: [
              {
                id: "s",
                displayName: "Student",
                studentNumber: "1",
                parentName: "Parent",
                parentPhone: "+639171111111",
                status: "PRESENT",
              },
            ],
          });
        if (input.action === "attendanceList")
          return response({
            attendance: [
              {
                id: "record",
                studentId: "s",
                sectionId: "A",
                status: "PRESENT",
                source: "ANDROID",
              },
            ],
          });
        return response({ teachers: [], attendance: [] });
      }),
    );
    await act(async () => root.render(<SparkPortal />));
    await flush();
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent === "Sections & students")!
        .click(),
    );
    await flush();
    const metrics = [...container.querySelectorAll(".metric")].map((metric) => [
      metric.querySelector("span")?.textContent,
      metric.querySelector("strong")?.textContent,
    ]);
    expect(metrics).toContainEqual(["On time", "0"]);
    expect(metrics).toContainEqual(["Present", "1"]);
    expect(metrics).toContainEqual(["Unmarked", "0"]);
  });
});
