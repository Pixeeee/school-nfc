
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const target = process.argv[2];
if (!target || !["staging", "production"].includes(target)) {
  throw new Error("Usage: node scripts/require-env.mjs <staging|production>");
}
const file = resolve(`apps/admin-web/.env.${target}`);
if (!existsSync(file)) throw new Error(`Missing ${file}. Copy .env.example and provide the Firebase web configuration.`);
const text = readFileSync(file, "utf8");
const required = ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID"];
for (const key of required) {
  if (!new RegExp(`^${key}=.+$`, "m").test(text) || new RegExp(`^${key}=.*(replace|example|your-)`, "mi").test(text)) {
    throw new Error(`${key} is missing or still a placeholder in ${file}`);
  }
}
console.log(`${target} environment is configured.`);
