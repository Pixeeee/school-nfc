import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { LoaderCircle } from "lucide-react";
export function Button({
  busy,
  variant = "primary",
  children,
  className,
  disabled,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      {...p}
      className={`btn btn-${variant} ${className ?? ""}`}
      disabled={disabled || busy}
    >
      {busy && <LoaderCircle className="spin" />}
      {children}
    </button>
  );
}
export function Field({
  label,
  error,
  children,
}: PropsWithChildren<{ label: string; error?: string }>) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small>{error}</small>}
    </label>
  );
}
export function Banner({
  kind = "error",
  children,
}: PropsWithChildren<{ kind?: "error" | "success" | "info" }>) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`banner banner-${kind}`}
    >
      {children}
    </div>
  );
}
