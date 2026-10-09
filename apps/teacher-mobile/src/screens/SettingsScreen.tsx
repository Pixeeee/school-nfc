import { useEffect, useState } from "react";
import { LogOut, Radio, Send, ShieldCheck } from "lucide-react";
import { SchoolNfc } from "../native/plugin";
import type { DeviceState, SubscriptionInfo } from "../native/types";
import { Banner, Button, Field } from "../components/Ui";

export function SettingsScreen({
  device,
  onLogout,
}: {
  device: DeviceState;
  onLogout: () => void;
}) {
  const [subs, setSubs] = useState<SubscriptionInfo[]>([]);
  const [selected, setSelected] = useState(
    String(device.selectedSubscriptionId ?? ""),
  );
  const [permission, setPermission] = useState(device.smsPermission);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (permission)
      void SchoolNfc.listSubscriptions()
        .then((r) => setSubs(r.subscriptions))
        .catch((e) => setError(e.message));
  }, [permission]);
  async function grantPermission() {
    try {
      setError("");
      const result = await SchoolNfc.requestSmsPermission();
      setPermission(result.granted);
      if (!result.granted)
        setError("SMS and phone permission are required to send parent texts.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permission request failed.");
    }
  }
  async function select(value: string) {
    if (!value) return;
    try {
      setError("");
      await SchoolNfc.selectSubscription({ subscriptionId: Number(value) });
      setSelected(value);
      setMessage("Prepaid SMS SIM saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "SIM selection failed.");
    }
  }
  async function test() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await SchoolNfc.sendTestSms({
        phone,
        message: "School attendance test. No attendance was recorded.",
      });
      setMessage(
        "Test SMS queued. Check the recipient phone to confirm delivery.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="standard-page">
      <span className="eyebrow">PHONE &amp; MESSAGING</span>
      <h1>Settings</h1>
      {message && <Banner kind="info">{message}</Banner>}
      {error && <Banner>{error}</Banner>}
      <section className="settings-card">
        <div className="settings-icon">
          <Radio />
        </div>
        <div>
          <h2>Prepaid SMS SIM</h2>
          <p>
            Parent texts use this SIM's load or SMS allowance. Long messages may
            use multiple SMS segments.
          </p>
          {!permission && (
            <Button variant="secondary" onClick={() => void grantPermission()}>
              Allow SMS &amp; phone access
            </Button>
          )}
          <Field label="Active SIM">
            <select
              value={selected}
              disabled={!permission}
              onChange={(e) => void select(e.target.value)}
            >
              <option value="">Select a SIM</option>
              {subs.map((s) => (
                <option value={s.subscriptionId} key={s.subscriptionId}>
                  {s.displayName} · {s.carrierName} · Slot {s.slotIndex + 1}
                </option>
              ))}
            </select>
          </Field>
          {permission && !subs.length && (
            <p>
              No active SIM found. Insert an SMS-capable SIM and reopen
              Settings.
            </p>
          )}
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-icon">
          <Send />
        </div>
        <div>
          <h2>Test your SMS setup</h2>
          <p>
            A test message also uses your SIM's load. Queued messages appear in
            Messages.
          </p>
          <Field label="Test recipient number">
            <input
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09171234567"
            />
          </Field>
          <Button
            variant="secondary"
            busy={busy}
            disabled={!permission || !selected || !phone.trim()}
            onClick={() => void test()}
          >
            Queue test message
          </Button>
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-icon">
          <ShieldCheck />
        </div>
        <div>
          <h2>Device authorization</h2>
          <p>
            Status: <strong>{device.status}</strong>
            <br />
            Lease expires:{" "}
            {device.leaseExpiresAt
              ? new Date(device.leaseExpiresAt).toLocaleString()
              : "Not issued"}
          </p>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await SchoolNfc.renewLease({ schoolId: device.schoolId! });
                setMessage("Device authorization renewed.");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Renewal failed.");
              }
            }}
          >
            Renew authorization
          </Button>
        </div>
      </section>
      <Button
        variant="danger"
        onClick={async () => {
          await SchoolNfc.signOut();
          onLogout();
        }}
      >
        <LogOut /> Sign out and lock app
      </Button>
    </div>
  );
}
