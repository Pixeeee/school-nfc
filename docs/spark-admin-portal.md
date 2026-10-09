# Firebase Spark attendance dashboard

Deploy `apps/admin-web` to Vercel with Node 22. Enable files outside the root directory so pnpm can build the shared contracts package. Deploy the repository root when using the Vercel CLI. The app's `vercel.json` supplies install, build, and routing settings.

Set `VITE_BACKEND=SPARK`, the Firebase web configuration from `.env.example`, and `VITE_USE_EMULATORS=false`. These client settings are public. Set server-only `FIREBASE_PROJECT_ID`, `SCHOOL_ID`, and production secret `FIREBASE_SERVICE_ACCOUNT_JSON`. Never prefix the service-account secret with `VITE_`, commit it, or provide it to untrusted preview builds. The API refuses to start when the service-account project differs from `FIREBASE_PROJECT_ID`.

Enable Firebase Email/Password Authentication and create Firestore on Spark. Deploy only the rules and indexes in `firebase.spark.json`; this portal uses Vercel's backend and does not need Firebase Functions, Storage, or a billing upgrade.

Use `scripts/provision-portal-admin.mjs` once with a private Admin SDK credential supplied through `GOOGLE_APPLICATION_CREDENTIALS`. Its arguments are project ID, school ID, username, email, and display name. Supply a JSON object containing the password on stdin. It creates a disabled account, commits the school membership and username mapping, then enables the account. It refuses to replace an existing account's password. A failed bootstrap leaves the account disabled for inspection and recovery.

Administrators create teachers and approve Android devices. Teachers own their sections and student records. Students have no login accounts. Each attendance change records an audit entry, and retries are idempotent. Disabled memberships and revoked tokens cannot access the API.

The web dashboard records Present and Absent. SIM SMS delivery runs on the installed Android teacher app with its approved device and configured SIM; browsers cannot send SMS using a phone's prepaid load. Web roll-call decisions remain separate from immutable Android arrival events so they do not accidentally trigger duplicate SMS.

Lists are bounded: 250 sections, students per section, teachers, or devices; attendance review reads up to 1,000 web decisions and 1,000 Android events per date. Larger schools should add pagination before exceeding those limits.

Validation: portal trust-boundary tests, React stale-response tests, and real Firebase Auth/Firestore emulator tests cover access control, ownership, teacher creation, admin bootstrap, attendance auditing, retry behavior, and date changes. Physical SIM delivery requires testing on a real phone.
