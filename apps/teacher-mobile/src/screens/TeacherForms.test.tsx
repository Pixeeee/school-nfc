// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SectionForm, StudentForm, SectionManagement } from "./TeacherForms";
const api = vi.hoisted(() => ({
  activeTeacherDirectory: vi.fn().mockResolvedValue({
    teachers: [
      { id: "teacherA", name: "Teacher A", username: "teacher_a" },
      { id: "teacherB", name: "Teacher B", username: "teacher_b" },
    ],
  }),
  createSection: vi.fn().mockResolvedValue({ sectionId: "new" }),
  createStudent: vi
    .fn()
    .mockResolvedValue({
      studentId: "student",
      guardianId: "parent",
      studentNumber: "G10-NARA-001",
    }),
  sectionAssign: vi.fn().mockResolvedValue({ adviserId: "teacherB" }),
  subjectSet: vi.fn().mockResolvedValue({ subjectId: "math" }),
}));
vi.mock("../native/plugin", () => ({ SchoolNfc: api }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.clearAllMocks();
});
async function render() {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <SectionManagement
        section={{
          id: "shared",
          name: "Shared",
          isAdviser: true,
          adviserId: "teacherA",
          subjects: [
            {
              id: "math",
              teacherId: "teacherA",
              name: "Math",
              startTime: "08:00",
              endTime: "09:00",
            },
          ],
        }}
        onSaved={onSaved}
        onCancel={() => {}}
      />,
    ),
  );
  return onSaved;
}
async function select(index: number, value: string) {
  await act(async () => {
    const input = container.querySelectorAll("select")[index]!;
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit(index: number) {
  await act(async () =>
    container
      .querySelectorAll("form")
      [index]!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
}
it("loads safe teacher choices and explicitly transfers adviser ownership", async () => {
  const onSaved = await render();
  expect(api.activeTeacherDirectory).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Teacher B · teacher_b");
  await select(0, "teacherB");
  await submit(0);
  expect(api.sectionAssign).toHaveBeenCalledWith({
    sectionId: "shared",
    adviserId: "teacherB",
  });
  expect(onSaved).toHaveBeenCalledOnce();
});
it("edits assignment of the existing subject without creating another subject", async () => {
  await render();
  await select(1, "math");
  await select(2, "teacherB");
  await submit(1);
  expect(api.subjectSet).toHaveBeenCalledWith({
    sectionId: "shared",
    subjectId: "math",
    teacherId: "teacherB",
    name: "Math",
    startTime: "08:00",
    endTime: "09:00",
  });
});
it("keeps failed writes visible and does not report a save", async () => {
  api.subjectSet.mockRejectedValueOnce(
    new Error("Only the current section adviser can configure this section."),
  );
  const onSaved = await render();
  await select(1, "math");
  await submit(1);
  expect(container.textContent).toContain("Only the current section adviser");
  expect(onSaved).not.toHaveBeenCalled();
});
it("retries a newly added subject with the same id after a failed setup refresh", async () => {
  const onSaved = await render();
  onSaved.mockRejectedValueOnce(new Error("Refresh is offline."));
  await select(2, "teacherB");
  await submit(1);
  const first = api.subjectSet.mock.calls[0]?.[0];
  expect(first).toEqual(
    expect.objectContaining({
      sectionId: "shared",
      teacherId: "teacherB",
      subjectId: expect.stringMatching(/^[a-f0-9-]{36}$/),
    }),
  );
  expect(container.textContent).toContain("Refresh is offline.");
  await submit(1);
  expect(api.subjectSet.mock.calls[1]?.[0].subjectId).toBe(first.subjectId);
});

async function renderForm(component: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(component));
}
async function input(label: string, value: string) {
  const field = [...container.querySelectorAll("label")]
    .find((l) => l.textContent?.startsWith(label))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("creates advisory classes in any grade without school configured grades or years", async () => {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  await renderForm(
    <SectionForm classKind="ADVISORY" onSaved={onSaved} onCancel={() => {}} />,
  );
  expect(container.querySelectorAll("option")).toHaveLength(12);
  expect(container.textContent).not.toContain("administrator");
  await select(0, "12");
  await input("Section name", " Nara ");
  await submit(0);
  expect(api.createSection).toHaveBeenCalledWith({
    requestId: expect.any(String),
    classKind: "ADVISORY",
    grade: 12,
    name: "Nara",
  });
  expect(onSaved).toHaveBeenCalledWith("new");
});
it("requires subject names and a valid schedule then preserves the request on retry", async () => {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  await renderForm(
    <SectionForm classKind="SUBJECT" onSaved={onSaved} onCancel={() => {}} />,
  );
  await input("Section name", "Nara");
  await submit(0);
  expect(api.createSection).not.toHaveBeenCalled();
  await input("Subject name", "Math");
  await input("End time", "07:00");
  await submit(0);
  expect(container.textContent).toContain("End time must be after start time.");
  expect(api.createSection).not.toHaveBeenCalled();
  await input("End time", "09:00");
  api.createSection.mockRejectedValueOnce(new Error("Offline"));
  await submit(0);
  await submit(0);
  const request = api.createSection.mock.calls[0]![0];
  expect(request).toEqual({
    requestId: expect.any(String),
    classKind: "SUBJECT",
    grade: 1,
    name: "Nara",
    subjectName: "Math",
    startTime: "08:00",
    endTime: "09:00",
  });
  expect(api.createSection.mock.calls[1]![0]).toEqual(request);
});
it("leaves student code generation to the server while keeping parent verification and consent", async () => {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  await renderForm(
    <StudentForm sectionId="nara" onSaved={onSaved} onCancel={() => {}} />,
  );
  expect(container.textContent).not.toContain("Student number");
  await input("First name", "Juan");
  await input("Last name", "Santos");
  await input("Parent name", "Maria");
  await input("Parent mobile number", "09171234567");
  expect(
    container.querySelectorAll('input[type="checkbox"][required]'),
  ).toHaveLength(2);
  await act(async () =>
    container
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((c) => c.click()),
  );
  await submit(0);
  expect(api.createStudent).toHaveBeenCalledWith({
    requestId: expect.any(String),
    sectionId: "nara",
    firstName: "Juan",
    lastName: "Santos",
    parentName: "Maria",
    parentPhone: "09171234567",
    parentPhoneVerified: true,
    parentConsent: true,
  });
  expect(onSaved).toHaveBeenCalledWith("G10-NARA-001");
});
