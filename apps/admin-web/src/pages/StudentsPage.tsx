
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createStudentSchema } from "@school-nfc/contracts";
import { useAuth } from "../auth/AuthProvider";
import { DataTable } from "../components/DataTable";
import { Banner, Button, Field, Modal, PageHeader, StatusBadge } from "../components/Ui";
import { useSchoolCollection } from "../hooks/useSchoolCollection";
import { callFunction } from "../lib/call";
import { displayError } from "../lib/format";

export function StudentsPage() {
  const { schoolId } = useAuth(); const data = useSchoolCollection<any>("students", "displayName");
  const [open, setOpen] = useState(false); const [message, setMessage] = useState<{kind:"error"|"success";text:string}|null>(null);
  const form = useForm<any>({ resolver: zodResolver(createStudentSchema), defaultValues: { schoolId: schoolId ?? "", suffix: "", preferredName: "", status: "ACTIVE" } });
  const submit = form.handleSubmit(async (values) => { try { await callFunction("createStudent", { ...values, schoolId }); setOpen(false); form.reset({ schoolId: schoolId ?? "", suffix: "", preferredName: "", status: "ACTIVE" }); setMessage({kind:"success",text:"Student created."}); } catch(e){setMessage({kind:"error",text:displayError(e)});} });
  return <><PageHeader title="Students" description="Manage enrollment identities and card readiness." action={<Button onClick={() => setOpen(true)}><Plus/> Add student</Button>}/>{message && <Banner kind={message.kind} onClose={() => setMessage(null)}>{message.text}</Banner>}<div className="card"><DataTable loading={data.loading} rows={data.items} columns={[{key:"student",header:"Student",render:r=><div className="identity"><div className="avatar">{r.displayName?.[0]}</div><div><strong>{r.displayName}</strong><span>{r.studentNumber}</span></div></div>},{key:"section",header:"Section",render:r=>r.sectionId},{key:"card",header:"Card",render:r=>r.activeCardId?"Assigned":"Not assigned"},{key:"status",header:"Status",render:r=><StatusBadge value={r.status}/>}]} /></div>{open && <Modal title="Add student" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit}><Field label="Student number" error={form.formState.errors.studentNumber?.message}><input {...form.register("studentNumber")}/></Field><Field label="First name" error={form.formState.errors.firstName?.message}><input {...form.register("firstName")}/></Field><Field label="Middle name"><input {...form.register("middleName")}/></Field><Field label="Last name" error={form.formState.errors.lastName?.message}><input {...form.register("lastName")}/></Field><Field label="Grade level ID" error={form.formState.errors.gradeLevelId?.message}><input {...form.register("gradeLevelId")}/></Field><Field label="Section ID" error={form.formState.errors.sectionId?.message}><input {...form.register("sectionId")}/></Field><Field label="Academic year ID" error={form.formState.errors.academicYearId?.message}><input {...form.register("academicYearId")}/></Field><div className="form-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" busy={form.formState.isSubmitting}>Create student</Button></div></form></Modal>}</>;
}
