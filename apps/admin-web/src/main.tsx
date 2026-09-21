
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { configStatus } from "./config";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
if (!configStatus.configured) {
  root.render(<StrictMode><div className="configuration"><h1>Firebase configuration required</h1><p>Copy <code>apps/admin-web/.env.example</code> to a local environment file and provide the Firebase web application values.</p><pre>{configStatus.issues.map((i)=>`${i.path.join(".")}: ${i.message}`).join("\n")}</pre></div></StrictMode>);
} else {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
  root.render(<StrictMode><QueryClientProvider client={client}><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>);
}
