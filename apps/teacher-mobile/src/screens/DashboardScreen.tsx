import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { Banner, Button, Field } from "../components/Ui";
import { SchoolNfc } from "../native/plugin";
import type { QueueSummary, TeacherReport } from "../native/types";
function schoolMonth() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}
export function DashboardScreen({ queue }: { queue: QueueSummary | null }) {
  const [month, setMonth] = useState(schoolMonth);
  const [report, setReport] = useState<TeacherReport | null>(null);
  const [classKey, setClassKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setReport(null);
    setError("");
    setClassKey("");
    setLoading(true);
    void SchoolNfc.teacherReport({ month })
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Report could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month, refresh]);
  const key = (row: TeacherReport["rows"][number]) =>
    `${row.sectionId}|${row.subjectId}`;
  const classes = [
    ...new Map(
      (report?.rows ?? []).map((row) => [
        key(row),
        `${row.sectionName} · ${row.subjectName}`,
      ]),
    ).entries(),
  ];
  const rows =
    report?.rows.filter((row) => !classKey || key(row) === classKey) ?? [];
  const totals = rows.reduce(
    (total, row) => ({
      onTime: total.onTime + row.onTime,
      late: total.late + row.late,
      absent: total.absent + row.absent,
      recorded: total.recorded + row.recorded,
    }),
    { onTime: 0, late: 0, absent: 0, recorded: 0 },
  );
  return (
    <div className="standard-page dashboard-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR ATTENDANCE REPORT</span>
          <h1>Dashboard</h1>
          <p>Monthly summary of the attendance you recorded.</p>
        </div>
        <div className="heading-icon">
          <BarChart3 />
        </div>
      </div>
      <div className="report-filters">
        <Field label="Report month">
          <input
            type="month"
            required
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </Field>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => setRefresh((x) => x + 1)}
        >
          <RefreshCw /> Refresh
        </Button>
      </div>
      {!!queue?.syncPending && (
        <Banner kind="info">
          {queue.syncPending} changes still need synchronization. This report
          includes Firebase records only. Synchronize in Messages, then refresh.
        </Banner>
      )}
      {error && <Banner>{error}</Banner>}
      {loading && <p role="status">Loading monthly report…</p>}
      {report && (
        <>
          <Field label="Class report">
            <select
              value={classKey}
              onChange={(e) => setClassKey(e.target.value)}
            >
              <option value="">All my classes</option>
              {classes.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <section className="report-metrics" aria-label="Monthly totals">
            {[
              ["On time", totals.onTime],
              ["Late", totals.late],
              ["Absent", totals.absent],
              ["Recorded", totals.recorded],
            ].map(([label, count]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{count}</strong>
              </article>
            ))}
          </section>
          <p className="report-note">
            Each student counts once per class or subject per recorded day,
            using the latest status. Late counts as present. Days without an
            attendance record are unmarked, not absent.
          </p>
          <h2>Student summary</h2>
          {!rows.length ? (
            <div className="empty-state">
              <BarChart3 />
              <h3>No attendance recorded</h3>
              <p>Choose another month or synchronize your attendance.</p>
            </div>
          ) : (
            <div
              className="report-table"
              tabIndex={0}
              role="region"
              aria-label="Monthly student summary"
            >
              <table>
                <thead>
                  <tr>
                    <th>Student / class</th>
                    <th>On time</th>
                    <th>Late</th>
                    <th>Absent</th>
                    <th>Recorded days</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${key(row)}|${row.studentId}`}>
                      <th scope="row">
                        {row.displayName}
                        <small>{row.studentNumber}</small>
                        <small>
                          {row.sectionName} · {row.subjectName}
                        </small>
                      </th>
                      <td>{row.onTime}</td>
                      <td>{row.late}</td>
                      <td>{row.absent}</td>
                      <td>{row.recorded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="report-note">
            Updated{" "}
            {new Intl.DateTimeFormat("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Manila",
            }).format(new Date(report.generatedAt))}
            . Only your own recorded attendance is included; past records remain
            after a student is removed.
          </p>
        </>
      )}
    </div>
  );
}
