# Firebase Spark attendance dashboard

Deploy `apps/admin-web` to Vercel with Node 22. Enable files outside the root directory so pnpm can build the shared contracts package. Deploy the repository root when using the Vercel CLI. The app's `vercel.json` supplies install, build, and routing settings.

Set `VITE_BACKEND=SPARK`, the Firebase web configuration from `.env.example`, and `VITE_USE_EMULATORS=false`. These client settings are public. Set server-only `FIREBASE_PROJECT_ID`, `SCHOOL_ID`, and production secret `FIREBASE_SERVICE_ACCOUNT_JSON`. Never prefix the service-account secret with `VITE_`, commit it, or provide it to untrusted preview builds. The API refuses to start when the service-account project differs from `FIREBASE_PROJECT_ID`.

Enable Firebase Email/Password Authentication and create Firestore on Spark. Deploy only the rules and indexes in `firebase.spark.json`; this portal uses Vercel's backend and does not need Firebase Functions, Storage, or a billing upgrade.

Use `scripts/provision-portal-admin.mjs` once with a private Admin SDK credential supplied through `GOOGLE_APPLICATION_CREDENTIALS`. Its arguments are project ID, school ID, username, email, and display name. Supply a JSON object containing the password on stdin. It creates a disabled account, commits the school membership and username mapping, then enables the account. It refuses to replace an existing account's password. A failed bootstrap leaves the account disabled for inspection and recovery.

The web dashboard is restricted to active school administrators. Teachers sign in to the Android app using the username and password issued by the administrator. Teacher creation accepts an optional email and optional initial password; leaving the password blank generates a secure initial password. The response and dashboard show that password once with `Cache-Control: no-store`. Passwords are never stored in school documents or username mappings. When no email is supplied, a private internal Auth email supports Firebase's Email/Password provider.

Administrators can view all teacher accounts and use **View classes** to select a teacher's sections and student roster, including parent contacts and daily attendance, or filter attendance review by teacher. Teachers can open their classrooms immediately after sign-in. Phone registration and administrator phone approval are not required. Students are attendance records, never authentication accounts.

Android username login calls the HTTPS portal endpoint with `client=ANDROID`. The server authenticates through Firebase, verifies an active teacher membership, and issues a Firebase custom token with the Android client claim and school ID. Web login defaults to `client=WEB` and accepts administrator membership only. Teacher API requests require the Android token claim; all administrator operations still require the administrator role. Teachers cannot gain administrator access by changing the client field.

SIM SMS delivery runs on the installed Android teacher app with its configured SIM; browsers cannot send SMS using a phone's prepaid load. Existing web roll-call decisions remain separate from immutable Android arrival events so they do not accidentally trigger duplicate SMS.

Lists are bounded: 250 sections, students per section, teachers, or devices; attendance review reads up to 1,000 web decisions and 1,000 Android events per date. Larger schools should add pagination before exceeding those limits.

Validation: portal trust-boundary tests, React stale-response tests, and real Firebase Auth/Firestore emulator tests cover access control, ownership, teacher creation, admin bootstrap, attendance auditing, retry behavior, and date changes. The optional `PortalLoginTest` instrumentation check verifies a disposable school-issued username against the deployed endpoint and Firebase Auth. Physical SIM delivery requires testing on a real phone.

Spark authorization is based on active school membership and ownership of the teacher’s sections. Device IDs remain attendance source metadata. The app refreshes its account-bound offline session automatically; it does not create or approve a phone registration document.

Each student stores a verified parent mobile number. Android Present and Absent changes atomically save the attendance event and queue a text to that saved number. Repeating the current status does not queue a second message; changing the status again records and texts the new decision. Manual events retain their own immutable event IDs, and the administrator views the latest native decision per student. SMS dispatch runs through WorkManager while the app is open or in the background, after Android SMS permission and SIM selection. Sending uses prepaid load; carrier delivery still requires a real-phone check.

## Adviser and subject attendance (Android 1.3.1)

In the teacher app, the current adviser selects **Manage section** to assign subjects and teachers with start/end times. The administrator views this data and attendance analytics. One student/parent roster is shared across those assignments. The section creator starts as its adviser; changing the adviser preserves existing students and attendance. Students have no sign-in accounts.

The assigned subject teacher chooses **Present on time**, **Present late**, or **Absent**, and can edit the subject schedule. Each subject has independent daily attendance. A schedule suggests lateness; the teacher confirms the actual tag. SMS includes the student, subject, schedule, school date and recorded time, sent through the selected prepaid SIM.

The adviser creates students and parent contacts, views all subject attendance, and confirms **Out** after reviewing the parent recipient count. The first Out requires connectivity to reserve a single section/day claim across phones. The same phone can retry after interruption without queueing another text; its complete local batch is saved before SMS dispatch starts. Dismissal refers to the section being dismissed, including parents whose student was absent.

Existing queues and rosters are retained by the additive Room upgrade. Regular attendance remains available with a valid cached account session; assignment changes require synchronization on offline phones. Release builds shrink unused code/resources and omit web source maps; the release smoke runner checks the installed signed APK's native feedback and JavaScript bridge.

## Teacher-owned setup (Android 1.3.1)

The administrator dashboard creates teacher accounts and provides read-only teacher/class attendance analytics. It has no class setup or roll-call controls. Administrator client accounts cannot write sections, students, subjects, attendance, dismissal or SMS data directly through Firestore.

In the teacher app, select a section and tap **Manage section**. Its current adviser can add subjects, choose the subject teacher and schedule, or hand over advisory responsibility to another active teacher. Subject teachers edit their own subject schedule. Assignments go through the existing authenticated Vercel backend, which checks the acting teacher, current adviser and target teacher in one transaction. The staff picker exposes names and usernames, never passwords or private email addresses.

The adviser setup query also supports sections created by older app versions. The rule uses the adviser field directly for list queries, while the original creator remains a compatibility metadata reader. Existing rosters and queued SMS are retained.
