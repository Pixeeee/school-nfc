
import { Activity, CreditCard, MessageSquareText, Smartphone, Users } from "lucide-react";
import { Card, PageHeader, StatusBadge } from "../components/Ui";
import { useSchoolCollection } from "../hooks/useSchoolCollection";
import { formatTimestamp } from "../lib/format";

export function DashboardPage() {
  const students = useSchoolCollection<any>("students");
  const attendance = useSchoolCollection<any>("attendanceEvents", "createdAt", 8);
  const cards = useSchoolCollection<any>("nfcCards");
  const sms = useSchoolCollection<any>("smsMessages", "updatedAt", 100);
  const devices = useSchoolCollection<any>("devices", "lastSeenAt", 100);
  const metrics = [
    ["Students", students.items.filter((x) => x.status === "ACTIVE").length, Users],
    ["Active cards", cards.items.filter((x) => x.status === "ACTIVE").length, CreditCard],
    ["SMS pending", sms.items.filter((x) => ["PENDING", "READY", "SENDING", "FAILED_RETRYABLE"].includes(x.status)).length, MessageSquareText],
    ["Approved devices", devices.items.filter((x) => x.status === "APPROVED").length, Smartphone],
  ] as const;
  return <><PageHeader title="Operations dashboard" description="Current school attendance, device, card, and notification health."/><div className="metric-grid">{metrics.map(([label, value, Icon]) => <Card key={label} className="metric"><div className="metric-icon"><Icon/></div><div><span>{label}</span><strong>{value}</strong></div></Card>)}</div><div className="dashboard-grid"><Card><div className="card-heading"><div><h2>Latest attendance</h2><p>Recently synchronized student events.</p></div><Activity/></div><div className="timeline">{attendance.items.length ? attendance.items.map((event) => <div className="timeline-item" key={event.id}><div className="timeline-dot"/><div><strong>{event.studentId}</strong><span>{event.eventType} · {formatTimestamp(event.createdAt)}</span></div><StatusBadge value={event.status ?? "PRESENT"}/></div>) : <p className="muted">No attendance has synchronized yet.</p>}</div></Card><Card><div className="card-heading"><div><h2>System health</h2><p>Actions requiring attention.</p></div></div><div className="health-list"><div><span>Failed SMS</span><strong>{sms.items.filter((x) => x.status === "FAILED_FINAL").length}</strong></div><div><span>Pending devices</span><strong>{devices.items.filter((x) => x.status === "PENDING").length}</strong></div><div><span>Lost or disabled cards</span><strong>{cards.items.filter((x) => ["LOST", "DISABLED"].includes(x.status)).length}</strong></div></div></Card></div></>;
}
