// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const api = vi.hoisted(() => ({
  backend: "FUNCTIONS",
  getAuthState: vi.fn().mockResolvedValue({ signedIn: true }),
  listSections: vi
    .fn()
    .mockResolvedValue({ sections: [{ id: "section_a", name: "Sampaguita" }] }),
  getTeacherSetup: vi.fn().mockResolvedValue({
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
  markPresent: vi.fn().mockResolvedValue({ status: "ACCEPTED", smsQueued: 1 }),
  stopScannerSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./native/plugin", () => ({ SchoolNfc: api }));
vi.mock("./hooks/useNativeState", () => ({
  useNativeState: () => ({
    device: {
      backend: api.backend,
      status: "APPROVED",
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
      (b) => b.textContent?.trim() === "Present",
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
  it("reports attendance errors without a success message", async () => {
    api.markPresent.mockRejectedValueOnce(new Error("Authorization expired"));
    await render();
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Present",
    )!;
    expect(button).toBeDefined();
    await act(async () => button.click());
    expect(container.textContent).toContain("Authorization expired");
  });
});
