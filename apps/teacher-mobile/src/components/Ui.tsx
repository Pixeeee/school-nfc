
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { LoaderCircle } from "lucide-react";
export function Button({busy,variant="primary",children,...p}:ButtonHTMLAttributes<HTMLButtonElement>&{busy?:boolean;variant?:"primary"|"secondary"|"danger"}){return <button className={`btn btn-${variant}`} disabled={p.disabled||busy}{...p}>{busy&&<LoaderCircle className="spin"/>}{children}</button>}
export function Field({label,error,children}:PropsWithChildren<{label:string;error?:string}>){return <label className="field"><span>{label}</span>{children}{error&&<small>{error}</small>}</label>}
export function Banner({kind="error",children}:PropsWithChildren<{kind?:"error"|"success"|"info"}>){return <div className={`banner banner-${kind}`}>{children}</div>}
