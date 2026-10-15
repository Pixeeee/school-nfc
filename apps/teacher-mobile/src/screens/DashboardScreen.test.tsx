// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardScreen } from "./DashboardScreen";
const api = vi.hoisted(() => ({
  teacherReport: vi.fn().mockResolvedValue({
    month: "2026-10",
    generatedAt: "2026-10-15T01:00:00Z",
    totals: { onTime: 2, late: 1, absent: 1, recorded: 4 },
    rows: [
      {
        studentId: "ada",
        displayName: "Ada Cruz",
        studentNumber: "G10-NARA-001",
        lastName: "Cruz",
        sectionId: "nara",
        sectionName: "Nara",
        subjectId: "",
        subjectName: "Advisory",
        onTime: 1,
        late: 1,
        absent: 0,
        recorded: 2,
      },
      {
        studentId: "ben",
        displayName: "Ben Santos",
        studentNumber: "G10-ACACIA-001",
        lastName: "Santos",
        sectionId: "acacia",
        sectionName: "Acacia",
        subjectId: "math",
        subjectName: "Math",
        onTime: 1,
        late: 0,
        absent: 1,
        recorded: 2,
      },
    ],
  }),
}));
vi.mock("../native/plugin", () => ({ SchoolNfc: api }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});
it("shows monthly totals, class filtering and a truthful synchronization notice", async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <DashboardScreen
        queue={{ syncPending: 2, smsPending: 0, smsRetry: 0, smsFailed: 0 }}
      />,
    ),
  );
  expect(api.teacherReport).toHaveBeenCalledWith({
    month: expect.stringMatching(/^\d{4}-\d{2}$/),
  });
  expect(container.textContent).toContain(
    "2 changes still need synchronization",
  );
  expect(container.textContent).toContain(
    "Days without an attendance record are unmarked",
  );
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  await act(async () => {
    const picker = container.querySelector("select")!;
    picker.value = "nara|";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(container.querySelector("tbody")?.textContent).toContain("Ada Cruz");
  expect(container.querySelector("tbody")?.textContent).not.toContain(
    "Ben Santos",
  );
  expect(
    [...container.querySelectorAll(".report-metrics strong")].map(
      (x) => x.textContent,
    ),
  ).toEqual(["1", "1", "0", "2"]);
});
