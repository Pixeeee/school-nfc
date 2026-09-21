
import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { Banner, Button, PageHeader, StatusBadge } from "../components/Ui";
import { useSchoolCollection } from "../hooks/useSchoolCollection";
import { formatTimestamp, displayError } from "../lib/format";
import { callFunction } from "../lib/call";
import { useAuth } from "../auth/AuthProvider";

export function CardsPage(){const d=useSchoolCollection<any>("nfcCards");return <><PageHeader title="NFC cards" description="Card inventory, state, assignment, and possible clone signals."/><div className="card"><DataTable loading={d.loading} rows={d.items} columns={[{key:"id",header:"Card",render:r=><code>{r.id.slice(0,12)}</code>},{key:"student",header:"Student",render:r=>r.studentId},{key:"status",header:"Status",render:r=><StatusBadge value={r.status}/>},{key:"updated",header:"Updated",render:r=>formatTimestamp(r.updatedAt)}]}/></div></>}
export function AttendancePage(){const d=useSchoolCollection<any>("attendanceEvents","createdAt",200);return <><PageHeader title="Attendance" description="Immutable source events synchronized by approved devices."/><div className="card"><DataTable loading={d.loading} rows={d.items} columns={[{key:"student",header:"Student",render:r=>r.studentId},{key:"type",header:"Event",render:r=><StatusBadge value={r.eventType}/>},{key:"time",header:"Local time",render:r=>r.localTimestamp},{key:"device",header:"Device",render:r=><code>{r.deviceId}</code>},{key:"status",header:"Status",render:r=><StatusBadge value={r.status}/>}]} /></div></>}
export function SmsPage(){const d=useSchoolCollection<any>("smsMessages","updatedAt",200);return <><PageHeader title="SMS monitoring" description="Delivery outcomes from each approved teacher device."/><div className="card"><DataTable loading={d.loading} rows={d.items} columns={[{key:"id",header:"Message",render:r=><code>{r.id.slice(0,12)}</code>},{key:"attendance",header:"Attendance event",render:r=><code>{r.attendanceEventId?.slice(0,12)}</code>},{key:"attempt",header:"Attempts",render:r=>r.attemptCount??0},{key:"status",header:"Status",render:r=><StatusBadge value={r.status}/>},{key:"updated",header:"Updated",render:r=>formatTimestamp(r.updatedAt)}]}/></div></>}
export function DevicesPage(){
  const{schoolId}=useAuth();
  const d=useSchoolCollection<any>("devices","lastSeenAt",200);
  const[error,setError]=useState<string|null>(null);
  const[busy,setBusy]=useState<string|null>(null);
  async function approve(id:string){
    const raw=window.prompt("Allowed section IDs, comma separated. Leave empty for school-wide admin devices:","");
    if(raw===null)return;
    try{setBusy(id);await callFunction("approveDevice",{schoolId,deviceId:id,allowedSectionIds:raw.split(",").map(x=>x.trim()).filter(Boolean),leaseHours:24});}
    catch(e){setError(displayError(e));}finally{setBusy(null)}
  }
  async function revoke(id:string){
    const reason=window.prompt("Reason for revocation (required):");if(!reason)return;
    try{setBusy(id);await callFunction("revokeDevice",{schoolId,deviceId:id,reason});}
    catch(e){setError(displayError(e));}finally{setBusy(null)}
  }
  return <><PageHeader title="Devices" description="Approve only known school phones and revoke lost equipment immediately."/>{error&&<Banner onClose={()=>setError(null)}>{error}</Banner>}<div className="card"><DataTable loading={d.loading} rows={d.items} columns={[
    {key:"name",header:"Device",render:r=><div><strong>{r.displayName}</strong><small>{r.manufacturer} {r.model}</small></div>},
    {key:"user",header:"Assigned user",render:r=><code>{r.assignedUserId}</code>},
    {key:"scope",header:"Section scope",render:r=>(r.allowedSectionIds?.length?r.allowedSectionIds.join(", "):"School-wide / not set")},
    {key:"seen",header:"Last seen",render:r=>formatTimestamp(r.lastSeenAt)},
    {key:"status",header:"Status",render:r=><StatusBadge value={r.status}/>},
    {key:"actions",header:"",render:r=><div className="row-actions">{r.status==="PENDING"&&<Button busy={busy===r.id} onClick={()=>void approve(r.id)}>Approve</Button>}{r.status!=="REVOKED"&&<Button variant="danger" busy={busy===r.id} onClick={()=>void revoke(r.id)}>Revoke</Button>}</div>}
  ]}/></div></>
}
export function AuditPage(){const d=useSchoolCollection<any>("auditLogs","createdAt",200);return <><PageHeader title="Audit history" description="Append-only record of sensitive actions."/><div className="card"><DataTable loading={d.loading} rows={d.items} columns={[{key:"event",header:"Event",render:r=><strong>{r.eventType}</strong>},{key:"target",header:"Target",render:r=><code>{r.targetType}:{r.targetId?.slice(0,12)}</code>},{key:"actor",header:"Actor",render:r=><code>{r.actorUserId?.slice(0,12)}</code>},{key:"reason",header:"Reason",render:r=>r.reason??"—"},{key:"time",header:"Time",render:r=>formatTimestamp(r.createdAt)}]}/></div></>}
export function AcademicsPage(){const years=useSchoolCollection<any>("academicYears","startDate");const sections=useSchoolCollection<any>("sections","name");return <><PageHeader title="Academics" description="Academic years, grade levels, and sections used for device scope."/><div className="dashboard-grid"><div className="card"><h2>Academic years</h2><DataTable loading={years.loading} rows={years.items} columns={[{key:"name",header:"Name",render:r=>r.name},{key:"dates",header:"Dates",render:r=>`${r.startDate} — ${r.endDate}`},{key:"active",header:"State",render:r=><StatusBadge value={r.active?"ACTIVE":"INACTIVE"}/>}]} /></div><div className="card"><h2>Sections</h2><DataTable loading={sections.loading} rows={sections.items} columns={[{key:"name",header:"Name",render:r=>r.name},{key:"grade",header:"Grade",render:r=>r.gradeLevelId},{key:"state",header:"State",render:r=><StatusBadge value={r.active?"ACTIVE":"INACTIVE"}/>}]} /></div></div></>}
