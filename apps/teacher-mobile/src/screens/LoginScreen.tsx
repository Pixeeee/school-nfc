import { useState } from "react";
import { School, ShieldCheck } from "lucide-react";
import { SchoolNfc } from "../native/plugin";
import { Banner, Button, Field } from "../components/Ui";
export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (
      !/^[a-z0-9_]{3,40}$/i.test(username.trim()) &&
      !/^\S+@\S+\.\S+$/.test(username.trim())
    ) {
      setError("Enter the username provided by your administrator.");
      return;
    }
    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    try {
      setBusy(true);
      await SchoolNfc.signIn({
        username: username.trim().toLowerCase(),
        password,
      });
      onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <div className="mobile-brand">
        <div>
          <School />
        </div>
        <span>School NFC</span>
      </div>
      <section className="auth-card">
        <span className="eyebrow">TEACHER DEVICE</span>
        <h1>Your classroom, ready for roll call.</h1>
        <p>
          Sign in with the teacher username and password provided by your
          administrator. You can create sections and student lists after signing
          in.
        </p>
        {error && <Banner>{error}</Banner>}
        <form onSubmit={submit}>
          <Field label="Username">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" busy={busy}>
            Sign in securely
          </Button>
        </form>
        <div className="security-note">
          <ShieldCheck />
          <span>No student or parent information is written to NFC cards.</span>
        </div>
      </section>
    </main>
  );
}
