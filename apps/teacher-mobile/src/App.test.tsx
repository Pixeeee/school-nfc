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
    expect(container.textContent).toContain("Advisory");
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
    expect(container.textContent).toContain("Tap a student");
  });
  it("marks the selected student present and reports queued SMS truthfully", async () => {
    await render();
    await act(async () =>
      (container.querySelector(".student-tile") as HTMLButtonElement).click(),
    );
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "On time",
    )!;
    expect(button).toBeDefined();
    await act(async () => button.click());
    expect(api.markPresent).toHaveBeenCalledWith({
      sectionId: "section_a",
      studentId: "juan",
      tag: "ON_TIME",
    });
    expect(container.textContent).toContain("1 parent SMS queued");
    expect(container.textContent).not.toContain("SMS delivered");
  });
  it("queues a parent message when the teacher marks Absent", async () => {
    api.backend = "SPARK";
    await render();
    await act(async () =>
      (container.querySelector(".student-tile") as HTMLButtonElement).click(),
    );
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
    await act(async () =>
      (container.querySelector(".student-tile") as HTMLButtonElement).click(),
    );
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "On time",
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
    await act(async () =>
      (container.querySelector(".student-tile") as HTMLButtonElement).click(),
    );
    const late = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Late",
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

it("shows section management only to the current Spark adviser", async () => {
  api.backend = "SPARK";
  api.getTeacherSetup.mockResolvedValueOnce({
    sections: [
      { id: "shared", name: "Shared", adviserId: "teacher_a", isAdviser: true },
    ],
    academicYears: [],
    gradeLevels: [],
  });
  await render();
  expect(container.textContent).toContain("Manage section");
});
it("keeps section management hidden from assigned subject teachers", async () => {
  api.backend = "SPARK";
  api.getTeacherSetup.mockResolvedValueOnce({
    sections: [
      {
        id: "shared",
        name: "Shared",
        adviserId: "teacher_b",
        isAdviser: false,
        subjects: [
          {
            id: "math",
            name: "Math",
            teacherId: "teacher_a",
            isAssigned: true,
            startTime: "08:00",
            endTime: "09:00",
          },
        ],
      },
    ],
    academicYears: [],
    gradeLevels: [],
  });
  await render();
  expect(container.textContent).not.toContain("Manage section");
  const addStudent = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Add student"),
  );
  expect(addStudent?.disabled).toBe(true);
});

it("selects compact student tiles before marking and uses the subject class owner's permissions", async () => {
  api.backend = "SPARK";
  api.getTeacherSetup.mockResolvedValueOnce({
    sections: [
      {
        id: "section_a",
        name: "Nara",
        classKind: "SUBJECT",
        grade: 10,
        canManageRoster: true,
        isAdviser: true,
        subjects: [
          {
            id: "math",
            name: "Math",
            teacherId: "teacher",
            isAssigned: true,
            startTime: "08:00",
            endTime: "09:00",
          },
        ],
      },
    ],
    academicYears: [],
    gradeLevels: [],
  });
  await render();
  expect(
    (container.querySelectorAll("select")[1] as HTMLSelectElement).value,
  ).toBe("math");
  expect(container.textContent).not.toContain("Manage section");
  expect(
    [...container.querySelectorAll("button")].some(
      (b) => b.textContent === "Out",
    ),
  ).toBe(false);
  expect(
    [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Add student"),
    )?.disabled,
  ).toBe(false);
  expect(
    [...container.querySelectorAll("button")].some(
      (b) => b.textContent === "Late",
    ),
  ).toBe(false);
  const tile = container.querySelector(".student-tile") as HTMLButtonElement;
  expect(tile.textContent).toContain("001");
  expect(tile.getAttribute("aria-pressed")).toBe("false");
  await act(async () => tile.click());
  expect(tile.getAttribute("aria-pressed")).toBe("true");
  for (const [label, tag] of [
    ["On time", "ON_TIME"],
    ["Late", "LATE"],
    ["Absent", "ABSENT"],
  ]) {
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent === label)!
        .click(),
    );
    expect(api.markSubject).toHaveBeenLastCalledWith({
      sectionId: "section_a",
      studentId: "juan",
      subjectId: "math",
      tag,
    });
  }
  expect(api.markPresent).not.toHaveBeenCalled();
  expect(api.markAbsent).not.toHaveBeenCalled();
});

it("keeps subject selection explicit for legacy advisory classes", async () => {
  api.backend = "SPARK";
  api.getTeacherSetup.mockResolvedValueOnce({
    sections: [
      {
        id: "section_a",
        name: "Legacy",
        isAdviser: true,
        subjects: ["math", "english"].map((id) => ({
          id,
          name: id,
          teacherId: "teacher",
          isAssigned: true,
          startTime: "08:00",
          endTime: "09:00",
        })),
      },
    ],
    academicYears: [],
    gradeLevels: [],
  });
  await render();
  expect(
    (container.querySelectorAll("select")[1] as HTMLSelectElement).value,
  ).toBe("");
  await act(async () =>
    (container.querySelector(".student-tile") as HTMLButtonElement).click(),
  );
  expect(container.textContent).toContain("Choose an assigned subject");
  expect(
    [...container.querySelectorAll("button")].some(
      (b) => b.textContent === "On time",
    ),
  ).toBe(false);
});

it("marks the chosen tile instead of the first student and preserves selection on failure", async () => {
  api.listSectionStudents.mockResolvedValueOnce({
    students: [
      {
        id: "juan",
        displayName: "Juan Santos",
        studentNumber: "001",
        sectionId: "section_a",
        present: false,
        smsStatus: "NONE",
      },
      {
        id: "ana",
        displayName: "Ana Reyes",
        studentNumber: "002",
        sectionId: "section_a",
        present: false,
        smsStatus: "NONE",
      },
    ],
    localSchoolDate: "2026-10-09",
  });
  api.markPresent.mockRejectedValueOnce(new Error("Save failed"));
  await render();
  const tiles = container.querySelectorAll<HTMLButtonElement>(".student-tile");
  await act(async () => tiles[1]!.click());
  expect(container.querySelector(".student-action-panel h3")?.textContent).toBe(
    "Ana Reyes",
  );
  expect(
    container
      .querySelector(".student-action-panel")!
      .compareDocumentPosition(container.querySelector(".roll-call-roster")!) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent === "On time")!
      .click(),
  );
  expect(api.markPresent).toHaveBeenCalledWith({
    sectionId: "section_a",
    studentId: "ana",
    tag: "ON_TIME",
  });
  expect(container.textContent).toContain("Save failed");
  expect(tiles[1]!.getAttribute("aria-pressed")).toBe("true");
});

it("marks advisory late attendance without requiring a subject", async () => {
  api.backend = "SPARK";
  api.getTeacherSetup.mockResolvedValueOnce({
    sections: [
      {
        id: "section_a",
        name: "Nara",
        classKind: "ADVISORY",
        grade: 10,
        isAdviser: true,
        canManageRoster: true,
        subjects: [],
      },
    ],
    academicYears: [],
    gradeLevels: [],
  });
  await render();
  await act(async () =>
    (container.querySelector(".student-tile") as HTMLButtonElement).click(),
  );
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent === "Late")!
      .click(),
  );
  expect(api.markPresent).toHaveBeenCalledWith({
    sectionId: "section_a",
    studentId: "juan",
    tag: "LATE",
  });
  expect(api.markSubject).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    "marked present late. 1 parent SMS queued.",
  );
});

it("distinguishes subject classes with the same grade and section in the class chooser", async () => {
  api.backend = "SPARK";
  api.getTeacherSetup.mockResolvedValueOnce({
    sections: ["Math", "English"].map((name) => ({
      id: name.toLowerCase(),
      name: "Nara",
      classKind: "SUBJECT",
      grade: 10,
      canManageRoster: true,
      isAdviser: false,
      subjects: [
        {
          id: name.toLowerCase(),
          name,
          teacherId: "teacher",
          isAssigned: true,
          startTime: "08:00",
          endTime: "09:00",
        },
      ],
    })),
    academicYears: [],
    gradeLevels: [],
  });
  await render();
  const picker = container.querySelector("select")!;
  expect([...picker.options].map((o) => o.textContent)).toEqual([
    "Choose a section",
    "Math · Grade 10 · Nara · Subject",
    "English · Grade 10 · Nara · Subject",
  ]);
  await act(async () => {
    picker.value = "english";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(
    (container.querySelectorAll("select")[1] as HTMLSelectElement).value,
  ).toBe("english");
  expect(api.listSectionStudents).toHaveBeenLastCalledWith({
    sectionId: "english",
    subjectId: "english",
  });
});
