import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  CreditCard,
  Nfc,
  Send,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { SchoolNfc } from "./native/plugin";
import { LoginScreen } from "./screens/LoginScreen";
import { DeviceScreen } from "./screens/DeviceScreen";
import { RollCallScreen } from "./screens/RollCallScreen";
import { ScannerScreen } from "./screens/ScannerScreen";
import { CardManagerScreen } from "./screens/CardManagerScreen";
import { QueueScreen } from "./screens/QueueScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useNativeState } from "./hooks/useNativeState";

type Tab = "attendance" | "scanner" | "cards" | "queue" | "settings";
const tabs: Array<[Tab, string, LucideIcon]> = [
  ["attendance", "Roll call", ClipboardCheck],
  ["scanner", "NFC", Nfc],
  ["cards", "Cards", CreditCard],
  ["queue", "Messages", Send],
  ["settings", "Settings", Settings],
];
export default function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("attendance");
  const { device, queue, lastScan, write, refreshDevice } = useNativeState();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    void SchoolNfc.getAuthState().then((a) => setSignedIn(a.signedIn));
  }, [refresh]);
  async function changeTab(next: Tab) {
    if (tab === "scanner") await SchoolNfc.stopScannerSession();
    setTab(next);
  }
  if (signedIn === null)
    return (
      <div className="splash">
        <ClipboardCheck />
        <strong>School Attendance</strong>
      </div>
    );
  if (!signedIn)
    return (
      <LoginScreen
        onLogin={() => {
          setSignedIn(true);
          void refreshDevice();
        }}
      />
    );
  if (!device || device.status !== "APPROVED" || !device.leaseId)
    return (
      <DeviceScreen
        device={device}
        onRefresh={() => {
          setRefresh((v) => v + 1);
          void refreshDevice();
        }}
      />
    );
  return (
    <div className="mobile-shell">
      <header>
        <div>
          <span className="online-dot" /> Teacher
        </div>
        <strong>School Attendance</strong>
        <span>{queue?.syncPending ?? 0} to sync</span>
      </header>
      <main>
        {tab === "attendance" && (
          <RollCallScreen
            device={device}
            queue={queue}
            onSettings={() => void changeTab("settings")}
          />
        )}
        {tab === "scanner" && (
          <ScannerScreen device={device} queue={queue} lastScan={lastScan} />
        )}
        {tab === "cards" && <CardManagerScreen device={device} write={write} />}
        {tab === "queue" && <QueueScreen queue={queue} />}
        {tab === "settings" && (
          <SettingsScreen
            device={device}
            onLogout={() => {
              setSignedIn(false);
              setTab("attendance");
              void refreshDevice();
            }}
          />
        )}
      </main>
      <nav aria-label="Main navigation">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => void changeTab(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
