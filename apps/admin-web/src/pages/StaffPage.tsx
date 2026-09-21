import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Banner, Button, Card, Field, PageHeader } from "../components/Ui";
import { callFunction } from "../lib/call";
import { displayError } from "../lib/format";

const formSchema=z.object({
  email:z.string().trim().toLowerCase().email(),
  role:z.enum(["SCHOOL_ADMIN","REGISTRAR","TEACHER","ATTENDANCE_OFFICER","AUDITOR"]),
  sectionIdsText:z.string().max(2000).default(""),
});
type Form=z.infer<typeof formSchema>;
export function StaffPage(){
  const{schoolId}=useAuth();const[result,setResult]=useState<string|null>(null);const[error,setError]=useState<string|null>(null);
  const form=useForm<Form>({resolver:zodResolver(formSchema),defaultValues:{email:"",role:"TEACHER",sectionIdsText:""}});
  const submit=form.handleSubmit(async(v)=>{try{setError(null);const r=await callFunction<any,{invitationToken:string}>("inviteMember",{
    schoolId,email:v.email,role:v.role,permissionAdditions:[],permissionRemovals:[],sectionIds:v.sectionIdsText.split(",").map(x=>x.trim()).filter(Boolean),
  });setResult(`${window.location.origin}/login?invite=${encodeURIComponent(r.invitationToken)}`);}catch(e){setError(displayError(e));}});
  return <><PageHeader title="Staff access" description="Invite staff with explicit role and section scope."/>{error&&<Banner>{error}</Banner>}{result&&<Banner kind="success">Invitation link created. Send it through an approved private channel.</Banner>}<Card><form className="form-grid compact" onSubmit={submit}><Field label="Email" error={form.formState.errors.email?.message}><input type="email" {...form.register("email")}/></Field><Field label="Role"><select {...form.register("role")}><option value="TEACHER">Teacher</option><option value="REGISTRAR">Registrar</option><option value="ATTENDANCE_OFFICER">Attendance officer</option><option value="AUDITOR">Auditor</option><option value="SCHOOL_ADMIN">School admin</option></select></Field><Field label="Section IDs (comma separated)" error={form.formState.errors.sectionIdsText?.message}><input {...form.register("sectionIdsText")}/></Field>{result&&<Field label="One-time invitation URL"><input readOnly value={result} onFocus={e=>e.currentTarget.select()}/></Field>}<div className="form-actions"><Button type="submit" busy={form.formState.isSubmitting}>Create invitation</Button></div></form></Card></>
}
