// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsScreen } from "./SettingsScreen";
import type { DeviceState } from "../native/types";

const api = vi.hoisted(() => ({
  getTeacherProfile: vi
    .fn()
    .mockResolvedValue({ username: "maya", schoolName: "Nara School" }),
  saveTeacherProfile: vi
    .fn()
    .mockResolvedValue({ username: "sir_jade", schoolName: "Acacia School" }),
  requestSmsPermission: vi
    .fn()
    .mockResolvedValue({ granted: false, blocked: true }),
  openPermissionSettings: vi.fn().mockResolvedValue(undefined),
  listSubscriptions: vi.fn().mockResolvedValue({
    subscriptions: [
      {
        subscriptionId: 1,
        displayName: "Demo SIM",
        carrierName: "Demo",
        slotIndex: 0,
        active: true,
      },
    ],
  }),
}));
vi.mock("../native/plugin", () => ({ SchoolNfc: api }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const device: DeviceState = {
  deviceId: "test",
  backend: "SPARK",
  status: "APPROVED",
  nfcAvailable: false,
  nfcEnabled: false,
  smsPermission: false,
  syncPending: 0,
  smsPending: 0,
};
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
    root.render(<SettingsScreen device={device} onLogout={() => {}} />),
  );
}
async function updateDevice(changes: Partial<DeviceState>) {
  await act(async () =>
    root.render(
      <SettingsScreen device={{ ...device, ...changes }} onLogout={() => {}} />,
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
it("shows blocked-permission recovery beside Allow instead of a hidden error", async () => {
  await render();
  const sim = [...container.querySelectorAll("section")].find((s) =>
    s.textContent?.includes("Prepaid SMS SIM"),
  )!;
  await act(async () => sim.querySelector("button")!.click());
  expect(api.requestSmsPermission).toHaveBeenCalledOnce();
  expect(sim.textContent).toContain("Android has blocked");
  const recovery = [...sim.querySelectorAll("button")].find(
    (b) => b.textContent === "Open app permissions",
  )!;
  expect(recovery).toBeTruthy();
  await act(async () => recovery.click());
  expect(api.openPermissionSettings).toHaveBeenCalledOnce();
  expect(container.querySelector<HTMLSelectElement>("select")!.disabled).toBe(
    true,
  );
});
it("loads SIMs after a successful Android prompt", async () => {
  api.requestSmsPermission.mockResolvedValueOnce({
    granted: true,
    blocked: false,
  });
  await render();
  const allow = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Allow SMS & phone access",
  )!;
  await act(async () => allow.click());
  expect(api.listSubscriptions).toHaveBeenCalledOnce();
  expect(container.querySelector<HTMLSelectElement>("select")!.disabled).toBe(
    false,
  );
  expect(container.textContent).toContain("Demo SIM");
  expect(container.textContent).toContain("SMS and Phone permissions allowed");
});
it("refreshes permission and SIM state after returning to the app", async () => {
  await render();
  await updateDevice({ smsPermission: true, selectedSubscriptionId: 1 });
  expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("1");
  expect(container.textContent).not.toContain("Allow SMS & phone access");
  await updateDevice({ smsPermission: false });
  expect(container.querySelector<HTMLSelectElement>("select")!.disabled).toBe(
    true,
  );
  expect(container.textContent).toContain("Allow SMS & phone access");
  await updateDevice({ smsPermission: true, selectedSubscriptionId: 1 });
  expect(container.querySelector<HTMLSelectElement>("select")!.value).toBe("1");
});
it("reloads a newly enabled SIM on resume even when permissions and selection are unchanged", async () => {
  api.listSubscriptions.mockResolvedValueOnce({ subscriptions: [] });
  await render();
  await updateDevice({ smsPermission: true });
  expect(container.querySelector<HTMLSelectElement>("select")!.disabled).toBe(
    true,
  );
  await updateDevice({ smsPermission: true });
  expect(api.listSubscriptions).toHaveBeenCalledTimes(2);
  expect(container.querySelector<HTMLSelectElement>("select")!.disabled).toBe(
    false,
  );
  expect(container.textContent).toContain("Demo SIM");
});
it("keeps SIM texting disabled and shows the error when SIM lookup fails", async () => {
  api.listSubscriptions.mockRejectedValueOnce(
    new Error("Phone permission was revoked."),
  );
  await render();
  await updateDevice({ smsPermission: true, selectedSubscriptionId: 1 });
  const sim = [...container.querySelectorAll("section")].find((s) =>
    s.textContent?.includes("Prepaid SMS SIM"),
  )!;
  expect(sim.textContent).toContain("Phone permission was revoked");
  expect(container.querySelector<HTMLSelectElement>("select")!.disabled).toBe(
    true,
  );
  await enter("Test recipient number", "09171234567");
  expect(
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Queue test message",
    )!.disabled,
  ).toBe(true);
});
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
    attendanceTemplate: "",
    dismissalTemplate: "",
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
