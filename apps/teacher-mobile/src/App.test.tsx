// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { TeacherSetup } from "./native/types";

const api = vi.hoisted(() => ({
  backend: "FUNCTIONS",
  status: "APPROVED",
  getAuthState: vi.fn().mockResolvedValue({ signedIn: true }),
  listSections: vi
    .fn()
    .mockResolvedValue({ sections: [{ id: "section_a", name: "Sampaguita" }] }),
  getTeacherSetup: vi.fn<() => Promise<TeacherSetup>>().mockResolvedValue({
    sections: [{ id: "section_a", name: "Sampaguita" }],
    academicYears: [],
    gradeLevels: [],
  }),
  listSectionStudents: vi.fn().mockResolvedValue({
    students: [
      {
        id: "juan",
        displayName: "Juan Santos",
        studentNumber: "001",
        sectionId: "section_a",
        present: false,
        smsStatus: "NONE",
      },
    ],
    localSchoolDate: "2026-10-09",
  }),
  markSubject: vi.fn().mockResolvedValue({ status: "ACCEPTED", smsQueued: 1 }),
  subjectAttendance: vi.fn().mockResolvedValue({ attendance: [] }),
  dismissalCount: vi.fn().mockResolvedValue({ count: 1 }),
  dismissSection: vi.fn().mockResolvedValue({ queued: 1 }),
  markAbsent: vi.fn().mockResolvedValue({ status: "ACCEPTED", smsQueued: 1 }),
  markPresent: vi.fn().mockResolvedValue({ status: "ACCEPTED", smsQueued: 1 }),
  stopScannerSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./native/plugin", () => ({ SchoolNfc: api }));
vi.mock("./hooks/useNativeState", () => ({
  useNativeState: () => ({
    device: {
      backend: api.backend,
      status: api.status,
      leaseId: "lease",
      schoolId: "school",
      smsPermission: true,
      selectedSubscriptionId: 1,
    },
    queue: { syncPending: 0, smsPending: 0 },
    write: { phase: "IDLE" },
  }),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.clearAllMocks();
  api.backend = "FUNCTIONS";
  api.status = "APPROVED";
});
async function render() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
}
describe("teacher app layout", () => {
  it("opens the classroom after Spark sign-in without phone registration", async () => {
    api.backend = "SPARK";
    api.status = "UNREGISTERED";
    await render();
    expect(container.textContent).toContain("Roll call");
    expect(container.textContent).toContain("New section");
    expect(container.textContent).not.toContain("Register phone");
  });
  it("shows the supported Spark screens without billable card issuance", async () => {
    api.backend = "SPARK";
    await render();
    const labels = [...container.querySelectorAll("nav button")].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(["Roll call", "NFC", "Messages", "Settings"]);
  });
  it("opens on roll call with the section roster", async () => {
    await render();
    expect(container.querySelector("h1")?.textContent).toBe("Roll call");
    expect(container.textContent).toContain("Sampaguita");
    expect(container.textContent).toContain("Juan Santos");
    expect(container.textContent).toContain("Present");
  });
  it("marks the selected student present and reports queued SMS truthfully", async () => {
    await render();
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Present on time",
    )!;
    expect(button).toBeDefined();
    await act(async () => button.click());
    expect(api.markPresent).toHaveBeenCalledWith({
      sectionId: "section_a",
      studentId: "juan",
    });
    expect(container.textContent).toContain("1 parent SMS queued");
    expect(container.textContent).not.toContain("SMS delivered");
  });
  it("queues a parent message when the teacher marks Absent", async () => {
    api.backend = "SPARK";
    await render();
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Absent",
    )!;
    await act(async () => button.click());
    expect(api.markAbsent).toHaveBeenCalledWith({
      sectionId: "section_a",
      studentId: "juan",
    });
    expect(container.textContent).toContain(
      "marked absent. 1 parent SMS queued",
    );
  });
  it("reports attendance errors without a success message", async () => {
    api.markPresent.mockRejectedValueOnce(new Error("Authorization expired"));
    await render();
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Present on time",
    )!;
    expect(button).toBeDefined();
    await act(async () => button.click());
    expect(container.textContent).toContain("Authorization expired");
  });
  it("marks explicit subject tags and confirms Out recipient count before queueing", async () => {
    api.backend = "SPARK";
    api.getTeacherSetup.mockResolvedValueOnce({
      sections: [
        {
          id: "section_a",
          name: "Sampaguita",
          isAdviser: true,
          subjects: [
            {
              id: "math",
              name: "Math",
              teacherId: "teacher",
              startTime: "08:00",
              endTime: "09:00",
              isAssigned: true,
            },
          ],
        },
      ],
      academicYears: [],
      gradeLevels: [],
    });
    await render();
    const subjectPicker = [...container.querySelectorAll("select")][1]!;
    await act(async () => {
      subjectPicker.value = "math";
      subjectPicker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const late = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Present late",
    )!;
    await act(async () => late.click());
    expect(api.markSubject).toHaveBeenCalledWith({
      sectionId: "section_a",
      studentId: "juan",
      subjectId: "math",
      tag: "LATE",
    });
    const out = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Out",
    )!;
    await act(async () => out.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "1 consenting active parent contacts",
    );
    expect(api.dismissSection).not.toHaveBeenCalled();
    const confirm = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Confirm Out"),
    )!;
    await act(async () => confirm.click());
    expect(api.dismissSection).toHaveBeenCalledWith({
      sectionId: "section_a",
      expectedCount: 1,
    });
    expect(container.textContent).toContain("1 dismissal SMS queued.");
  });
  it("shows adviser all-subject unmarked grid even when there are no recorded events", async () => {
    api.backend = "SPARK";
    api.getTeacherSetup.mockResolvedValueOnce({
      sections: [
        {
          id: "section_a",
          name: "Sampaguita",
          isAdviser: true,
          subjects: [
            {
              id: "math",
              name: "Math",
              teacherId: "other",
              startTime: "08:00",
              endTime: "09:00",
              isAssigned: false,
            },
          ],
        },
      ],
      academicYears: [],
      gradeLevels: [],
    });
    await render();
    const view = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "View all subject attendance",
    )!;
    await act(async () => view.click());
    expect(container.querySelector("table")?.textContent).toContain("Unmarked");
    expect(container.querySelector("table")?.textContent).toContain("Math");
  });
});
