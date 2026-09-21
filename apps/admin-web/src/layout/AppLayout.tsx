
import { NavLink, Outlet } from "react-router-dom";
import { Activity, BadgeCheck, BookOpen, CreditCard, Gauge, LogOut, Menu, MessageSquareText, School, Settings, ShieldCheck, Smartphone, UserRoundCog, Users, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";

const links = [
  ["/app", "Dashboard", Gauge], ["/app/students", "Students", Users], ["/app/guardians", "Guardians", BadgeCheck],
  ["/app/academics", "Academics", BookOpen], ["/app/cards", "NFC Cards", CreditCard], ["/app/attendance", "Attendance", Activity],
  ["/app/sms", "SMS", MessageSquareText], ["/app/devices", "Devices", Smartphone], ["/app/staff", "Staff", UserRoundCog],
  ["/app/audit", "Audit", ShieldCheck], ["/app/settings", "Settings", Settings],
] as const;

export function AppLayout() {
  const { user, memberships, schoolId, setSchoolId, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const membership = memberships.find((m) => m.schoolId === schoolId);
  return <div className="shell">
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><School /></div><div><strong>School NFC</strong><span>Secure attendance</span></div><button className="mobile-close" onClick={() => setOpen(false)}><X /></button></div>
      <nav>{links.map(([to, label, Icon], index) => <NavLink key={to} to={to} end={index === 0} onClick={() => setOpen(false)}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-user"><div className="avatar">{user?.email?.slice(0, 1).toUpperCase()}</div><div><strong>{user?.email}</strong><span>{membership?.role?.replaceAll("_", " ") ?? "No school"}</span></div><button title="Sign out" onClick={() => void logout()}><LogOut size={18}/></button></div>
    </aside>
    <div className="main-panel"><header className="topbar"><button className="menu-button" onClick={() => setOpen(true)}><Menu /></button><div className="school-select"><span>School workspace</span><select value={schoolId ?? ""} onChange={(e) => setSchoolId(e.target.value)}>{memberships.map((m) => <option key={m.schoolId} value={m.schoolId}>{m.schoolId}</option>)}</select></div><div className="secure-chip"><ShieldCheck size={16}/> Protected</div></header><main><Outlet /></main></div>
    {open && <button className="scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
  </div>;
}
