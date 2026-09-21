
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useSearchParams } from "react-router-dom";
import { School, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { useAuth } from "../auth/AuthProvider";
import { Banner, Button, Field } from "../components/Ui";
import { callFunction } from "../lib/call";
import { displayError } from "../lib/format";

const schema = z.object({ email: z.string().email(), password: z.string().min(8) });
type FormData = z.infer<typeof schema>;
export function LoginPage() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });
  if (user && !params.get("invite")) return <Navigate to="/app" replace />;
  const submit = handleSubmit(async (data) => {
    setError(null);
    try {
      if (!user) await login(data.email, data.password);
      const token = params.get("invite");
      if (token) { setAccepting(true); await callFunction("acceptInvitation", { invitationToken: token }); window.location.assign("/app"); }
    } catch (e) { setError(displayError(e)); setAccepting(false); }
  });
  return <div className="login-page"><section className="login-story"><div className="brand-large"><School/><span>School NFC</span></div><h1>Fast attendance.<br/>Reliable parent notification.</h1><p>Student taps are committed locally first, while SMS and cloud synchronization continue independently.</p><div className="trust-row"><ShieldCheck/><span>Tenant isolation, device leases, immutable audit history, and no personal data stored on NFC cards.</span></div></section><section className="login-form-panel"><form className="login-card" onSubmit={submit}><div><span className="eyebrow">AUTHORIZED STAFF</span><h2>{params.get("invite") ? "Accept your invitation" : "Sign in"}</h2><p>Use your school-issued account.</p></div>{error && <Banner>{error}</Banner>}<Field label="Email" error={errors.email?.message}><input type="email" autoComplete="email" {...register("email")}/></Field><Field label="Password" error={errors.password?.message}><input type="password" autoComplete="current-password" {...register("password")}/></Field><Button type="submit" busy={isSubmitting || accepting}>{params.get("invite") ? "Sign in and accept" : "Sign in securely"}</Button></form></section></div>;
}
