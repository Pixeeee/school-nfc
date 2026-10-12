// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsScreen } from "./SettingsScreen";

const api = vi.hoisted(() => ({
  getTeacherProfile: vi
    .fn()
    .mockResolvedValue({ username: "maya", schoolName: "Nara School" }),
  saveTeacherProfile: vi
    .fn()
    .mockResolvedValue({ username: "sir_jade", schoolName: "Acacia School" }),
}));
vi.mock("../native/plugin", () => ({ SchoolNfc: api }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});
async function render() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <SettingsScreen
        device={{
          deviceId: "test",
          backend: "SPARK",
          status: "APPROVED",
          nfcAvailable: false,
          nfcEnabled: false,
          smsPermission: false,
          syncPending: 0,
          smsPending: 0,
        }}
        onLogout={() => {}}
      />,
    ),
  );
}
async function enter(label: string, value: string) {
  const input = [...container.querySelectorAll("label")]
    .find((l) => l.textContent === label)!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("loads this teacher's profile and saves both SMS sender details", async () => {
  await render();
  expect(api.getTeacherProfile).toHaveBeenCalledOnce();
  expect(
    container.querySelector<HTMLInputElement>('input[name="smsUsername"]')
      ?.value,
  ).toBe("maya");
  await enter("Username in texts", " sir_jade ");
  await enter("School", " Acacia School ");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(api.saveTeacherProfile).toHaveBeenCalledWith({
    username: "sir_jade",
    schoolName: "Acacia School",
  });
  expect(container.textContent).toContain("Teacher profile saved");
});
it("keeps unsaved edits visible if the Firebase save fails", async () => {
  api.saveTeacherProfile.mockRejectedValueOnce(
    new Error("Check your connection."),
  );
  await render();
  await enter("Username in texts", "sir_jade");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(container.textContent).toContain("Check your connection.");
  expect(container.textContent).not.toContain("Teacher profile saved");
  expect(
    container.querySelector<HTMLInputElement>('input[name="smsUsername"]')
      ?.value,
  ).toBe("sir_jade");
});
