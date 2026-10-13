import { useEffect, useState } from "react";
import { LogOut, Radio, Send, ShieldCheck, UserRound } from "lucide-react";
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
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [simError, setSimError] = useState("");
  const [simLoading, setSimLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileBusy, setProfileBusy] = useState(false);
  useEffect(() => {
    setPermission(device.smsPermission);
    setSelected(String(device.selectedSubscriptionId ?? ""));
  }, [device.smsPermission, device.selectedSubscriptionId]);
  useEffect(() => {
    let cancelled = false;
    void SchoolNfc.getTeacherProfile()
      .then((profile) => {
        if (!cancelled) {
          setUsername(profile.username);
          setSchoolName(profile.schoolName);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Profile could not be loaded.",
          );
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function saveProfile() {
    setProfileBusy(true);
    setError("");
    setMessage("");
    try {
      const profile = await SchoolNfc.saveTeacherProfile({
        username: username.trim(),
        schoolName: schoolName.trim(),
      });
      setUsername(profile.username);
      setSchoolName(profile.schoolName);
      setMessage(
        "Teacher profile saved. New parent texts will include your username and school.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Profile could not be saved. Check your connection.",
      );
    } finally {
      setProfileBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    setSubs([]);
    if (!permission) {
      setSimLoading(false);
      return;
    }
    setPermissionBlocked(false);
    setSimError("");
    setSimLoading(true);
    void SchoolNfc.listSubscriptions()
      .then((r) => {
        if (!cancelled) setSubs(r.subscriptions);
      })
      .catch((e) => {
        if (!cancelled)
          setSimError(
            e instanceof Error ? e.message : "SIM list could not be loaded.",
          );
      })
      .finally(() => {
        if (!cancelled) setSimLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [permission, device]);
  async function grantPermission() {
    setPermissionBusy(true);
    try {
      setSimError("");
      const result = await SchoolNfc.requestSmsPermission();
      setPermission(result.granted);
      setPermissionBlocked(result.blocked);
      if (!result.granted)
        setSimError(
          result.blocked
            ? "Android has blocked further permission pop-ups. Open app permissions and allow SMS and Phone. If SMS is unavailable, your phone's installer or device policy may restrict SIM texting."
            : "Allow both SMS and Phone in the Android pop-ups to select your SIM. Attendance remains available without texting.",
        );
    } catch (e) {
      setSimError(
        e instanceof Error ? e.message : "Permission request failed.",
      );
    } finally {
      setPermissionBusy(false);
    }
  }
  async function openPermissions() {
    try {
      await SchoolNfc.openPermissionSettings();
    } catch (e) {
      setSimError(
        e instanceof Error ? e.message : "Could not open app permissions.",
      );
    }
  }
  async function select(value: string) {
    if (!value) return;
    try {
      setSimError("");
      await SchoolNfc.selectSubscription({ subscriptionId: Number(value) });
      setSelected(value);
      setMessage("Prepaid SMS SIM saved.");
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "SIM selection failed.");
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
          <UserRound />
        </div>
        <div>
          <h2>Teacher profile</h2>
          <p>
            Your username and school are included in new attendance, subject and
            Out texts. This sets your SMS sender details.
          </p>
          {profileLoading && <p role="status">Loading teacher profile…</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveProfile();
            }}
          >
            <Field label="Username in texts">
              <input
                name="smsUsername"
                required
                maxLength={60}
                value={username}
                disabled={profileLoading || profileBusy}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="School">
              <input
                name="smsSchool"
                required
                maxLength={100}
                value={schoolName}
                disabled={profileLoading || profileBusy}
                onChange={(e) => setSchoolName(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              busy={profileBusy}
              disabled={
                profileLoading || !username.trim() || !schoolName.trim()
              }
            >
              Save profile
            </Button>
          </form>
          <p>
            Save while connected to the internet. Saved details remain available
            for offline attendance on this phone.
          </p>
        </div>
      </section>
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
            <Button
              variant="secondary"
              busy={permissionBusy}
              onClick={() => void grantPermission()}
            >
              Allow SMS &amp; phone access
            </Button>
          )}
          {simError && <Banner>{simError}</Banner>}
          {!permission && permissionBlocked && (
            <Button variant="secondary" onClick={() => void openPermissions()}>
              Open app permissions
            </Button>
          )}
          {permission && (
            <p role="status">SMS and Phone permissions allowed.</p>
          )}
          {simLoading && <p role="status">Loading active SIMs…</p>}
          <Field label="Active SIM">
            <select
              value={selected}
              disabled={!permission || simLoading || !subs.length}
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
          {permission && !simLoading && !simError && !subs.length && (
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
            disabled={
              !permission ||
              simLoading ||
              !subs.some((s) => String(s.subscriptionId) === selected) ||
              !phone.trim()
            }
            onClick={() => void test()}
          >
            Queue test message
          </Button>
        </div>
      </section>
      {device.backend !== "SPARK" && (
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
      )}
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
