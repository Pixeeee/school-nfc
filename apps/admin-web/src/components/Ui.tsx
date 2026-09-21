
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";

export function Button({ className = "", variant = "primary", busy, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; busy?: boolean }) {
  return <button className={`button button-${variant} ${className}`} disabled={props.disabled || busy} {...props}>{busy && <LoaderCircle size={17} className="spin" />}{children}</button>;
}
export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) { return <section className={`card ${className}`}>{children}</section>; }
export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <header className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{action}</header>; }
export function Field({ label, error, children }: PropsWithChildren<{ label: string; error?: string }>) { return <label className="field"><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>; }
export function Empty({ title, description }: { title: string; description: string }) { return <div className="empty"><div className="empty-icon">◇</div><strong>{title}</strong><p>{description}</p></div>; }
export function Loading() { return <div className="loading"><LoaderCircle className="spin" /> Loading…</div>; }
export function Banner({ kind = "error", children, onClose }: PropsWithChildren<{ kind?: "error" | "success" | "info"; onClose?: () => void }>) { return <div className={`banner banner-${kind}`}>{kind === "success" ? <CheckCircle2 /> : <AlertCircle /> }<span>{children}</span>{onClose && <button aria-label="Close" onClick={onClose}><X /></button>}</div>; }
export function Modal({ title, children, onClose }: PropsWithChildren<{ title: string; onClose: () => void }>) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>{children}</div></div>; }
export function StatusBadge({ value }: { value: string }) { return <span className={`status status-${value.toLowerCase().replaceAll("_", "-")}`}>{value.replaceAll("_", " ")}</span>; }
