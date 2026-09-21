import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) {
    fail(`Required file is missing: ${relativePath}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function assertContains(path, value, reason) {
  const contents = read(path);
  if (!contents.includes(value)) fail(`${path}: ${reason}`);
}

function assertNotContains(path, value, reason) {
  const contents = read(path);
  if (contents.includes(value)) fail(`${path}: ${reason}`);
}

const ignoredSegments = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".turbo",
  ".gradle",
  "reports",
]);
const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml",
  ".rules", ".xml", ".kt", ".java", ".gradle", ".kts", ".properties", ".txt",
  ".env", ".example", ".gitignore", "",
]);

function walk(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    if (ignoredSegments.has(name)) continue;
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walk(path));
    else if (stats.size <= 2_000_000 && textExtensions.has(extname(path))) files.push(path);
  }
  return files;
}

const secretPatterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/"type"\s*:\s*"service_account"/, "service-account credential"],
  [/AIza[0-9A-Za-z_-]{30,}/, "Google API key"],
  [/gh[pousr]_[A-Za-z0-9_]{30,}/, "GitHub token"],
  [/xox[baprs]-[A-Za-z0-9-]{20,}/, "Slack token"],
];

for (const file of walk(root)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel.endsWith(".example") || rel.includes("/fixtures/") || rel.includes("/test/")) continue;
  const text = readFileSync(file, "utf8");
  for (const [pattern, label] of secretPatterns) {
    if (pattern.test(text)) fail(`${rel}: possible ${label}`);
  }
}

const firestoreRules = read("firebase/firestore.rules");
if (!/match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/.test(firestoreRules)) {
  fail("Firestore Rules do not contain a final default-deny rule.");
}
if (/allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+true/.test(firestoreRules)) {
  fail("Firestore Rules contain public access.");
}
if (!firestoreRules.includes("sectionAllowed")) {
  fail("Firestore Rules do not enforce section scope.");
}
if (!firestoreRules.includes("allow create, update, delete: if false")) {
  fail("Privileged Firestore writes are not routed exclusively through trusted functions.");
}

const storageRules = read("firebase/storage.rules");
if (!/match \/\{allPaths=\*\*\}[\s\S]*allow read, write: if false;/.test(storageRules)) {
  fail("Storage Rules do not contain a final default-deny rule.");
}
if (!storageRules.includes("request.resource.size < 5 * 1024 * 1024")) {
  fail("Student photo uploads do not have a size cap.");
}
if (!storageRules.includes("studentSectionAllowed")) {
  fail("Storage Rules do not enforce student section scope.");
}

assertContains(
  "apps/functions/src/callables/secure-ingestion.ts",
  "canonicalAttendanceKey",
  "server attendance idempotency is not recomputed",
);
assertContains(
  "apps/functions/src/callables/secure-ingestion.ts",
  "assertDeviceAndLease",
  "attendance ingestion does not verify the approved device lease",
);
assertContains(
  "apps/functions/src/callables/secure-ingestion.ts",
  "Guardian is not eligible for SMS notification",
  "SMS result ingestion does not verify guardian eligibility",
);
assertContains(
  "apps/functions/src/callables/guardian-update.ts",
  "verificationConfirmed",
  "guardian numbers can be marked verified without explicit confirmation",
);

const callableDirectory = join(root, "apps/functions/src/callables");
for (const file of walk(callableDirectory).filter((path) => path.endsWith(".ts"))) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("onCall(")) continue;
  const protectedByLocalOptions = source.includes("enforceAppCheck: true");
  const protectedBySharedOptions = /onCall\(\s*[A-Za-z_$][\w$]*\s*,/.test(source)
    || /secureCallable/.test(source);
  if (!protectedByLocalOptions && !protectedBySharedOptions) {
    fail(`${relative(root, file)}: callable does not visibly enforce App Check`);
  }
}

const nfcSources = walk(join(root, "apps/teacher-mobile/android"))
  .filter((path) => path.endsWith(".kt"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
if (!nfcSources.includes("AES/GCM/NoPadding")) {
  fail("Guardian destinations are not protected with Android Keystore AES-GCM.");
}
if (!nfcSources.includes("enableReaderMode")) {
  fail("Native NFC Reader Mode is not implemented.");
}
if (!nfcSources.includes("SmsManager")) {
  fail("Native SIM SMS sender is not implemented.");
}
if (!nfcSources.includes("WorkManager") && !nfcSources.includes("CoroutineWorker")) {
  fail("Persistent background queue recovery is not implemented.");
}
if (!nfcSources.includes("idempotency")) {
  fail("Native attendance/SMS idempotency is not present.");
}

const manifest = read("apps/teacher-mobile/android/app/src/main/AndroidManifest.xml");
for (const permission of ["android.permission.NFC", "android.permission.SEND_SMS"]) {
  if (!manifest.includes(permission)) fail(`Android manifest is missing ${permission}.`);
}
for (const excessive of ["android.permission.READ_SMS", "android.permission.RECEIVE_SMS", "android.permission.READ_CONTACTS"]) {
  if (manifest.includes(excessive)) fail(`Android manifest requests unnecessary sensitive permission ${excessive}.`);
}

const gradle = read("apps/teacher-mobile/android/app/build.gradle");
if (gradle.includes("com.example")) fail("Android application ID still uses com.example.");
if (!gradle.includes("com.pixeeee.schoolnfc")) fail("Android application ID is not set to com.pixeeee.schoolnfc.");

const gitignore = read(".gitignore");
for (const ignored of ["google-services.json", "*.jks", "*.keystore", ".env", "service-account"]) {
  if (!gitignore.includes(ignored)) fail(`.gitignore does not protect ${ignored}.`);
}

const firebaseConfig = read("firebase.json");
for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy"]) {
  if (!firebaseConfig.includes(header)) fail(`Firebase Hosting is missing ${header}.`);
}

if (!existsSync(join(root, "pnpm-lock.yaml"))) fail("pnpm-lock.yaml is missing.");
if (!existsSync(join(root, "SECURITY.md"))) fail("SECURITY.md is missing.");
if (!existsSync(join(root, "docs/DEPLOYMENT.md"))) fail("Deployment documentation is missing.");

try {
  execFileSync("git", ["diff", "--check"], { cwd: root, stdio: "pipe" });
} catch (error) {
  fail(`git diff --check failed: ${error instanceof Error ? error.message : String(error)}`);
}

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (failures.length > 0) {
  console.error("Security gate failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Security gate passed.");
