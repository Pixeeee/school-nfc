# Firebase administrator and teacher portal

Goal: deploy the existing web app to Vercel with Firebase-backed administrator/teacher accounts and scoped roll call, without Firebase billing.

- Add a verified-ID-token Vercel API. Resolve active membership on every request; only administrators create teacher accounts and approve native phones. Passwords go only to Firebase Auth and are never stored in Firestore or logs.
- Use existing sparkSections/sparkStudents and the atomic student-number index so mobile roster sync continues to work. Add explicit web daily Present/Absent records; never treat unmarked as absent or claim browser SIM delivery.
- Add a Spark portal entry alongside the legacy app: username/email login, admin summary and teacher creation, teacher sections/student forms and roll call, admin phone approval and attendance view. Reuse current UI and styling.
- Test unauthenticated, revoked/nonmember, cross-teacher and role-escalation requests; duplicate student numbers and atomic writes; explicit daily attendance and invalid inputs. Build, inspect browser layouts, deploy, then test live Firebase only with authorized project credentials.
- Provision kimdanez21 as SCHOOL_ADMIN using the supplied password privately after the administrator email and project credentials are available. No public bootstrap endpoint or hardcoded password. Configure Vercel server secrets and Firebase client configuration through environment variables.
