import { spawnSync } from "node:child_process";
const [projectId] = process.argv.slice(2);
if (!projectId || !/^[a-z][a-z0-9-]{4,29}$/.test(projectId))
  throw new Error("Pass the Firebase Project ID.");
// Explicit targets keep Functions and Storage out of a no-billing deployment.
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "firebase",
    "deploy",
    "--config",
    "firebase.spark.json",
    "--project",
    projectId,
    "--only",
    "firestore:rules,firestore:indexes",
    "--non-interactive",
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
