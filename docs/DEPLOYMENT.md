# Deployment Guide

## 1. Environment separation

Create independent Google Cloud/Firebase projects for development, staging, and production. Do not reuse Authentication users, Firestore data, App Check registrations, buckets, or service credentials between them.

Copy `.firebaserc.example` to `.firebaserc` and replace every placeholder locally. `.firebaserc` may be committed only when the project IDs are intentionally public and reviewed; otherwise keep environment selection in CI.

## 2. Firebase services

Enable:

- Firebase Authentication: email/password initially
- Cloud Firestore
- Cloud Storage
- Cloud Functions
- Firebase Hosting
- Firebase App Check
- Crashlytics and Performance Monitoring for Android
- Artifact Registry and required Functions APIs

Deploy indexes before importing production records.

## 3. Admin web variables

Create `apps/admin-web/.env.production` from `.env.example`. Required values:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_APPCHECK_SITE_KEY
```

These identify the Firebase web app; they do not replace Security Rules, App Check, authentication, or server authorization.

## 4. Android Firebase registration

Register Android application ID:

```text
com.pixeeee.schoolnfc
```

Provide the environment-specific `google-services.json` only during local/CI build. Register SHA-256 fingerprints for all debug, staging, and production certificates before enforcing Play Integrity.

For privately sideloaded deployments where Play Integrity is unsuitable, configure a reviewed custom App Check provider. Never silently disable production App Check enforcement.

## 5. GitHub environment secrets

Create `staging` and `production` GitHub environments with reviewers and these secrets:

```text
FIREBASE_PROJECT_ID
ADMIN_WEB_ENV
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Use Workload Identity Federation instead of a long-lived service-account JSON key.

The deploy service account needs only the permissions required to deploy Hosting, Functions, Firestore Rules/indexes, and Storage Rules to its assigned project.

## 6. Bootstrap platform administration

Run the bootstrap script with Application Default Credentials from a controlled administrator workstation:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/bootstrap-service-account.json \
FIREBASE_PROJECT_ID=your-production-project \
PLATFORM_ADMIN_UID=the-firebase-auth-uid \
pnpm bootstrap:platform-admin
```

Delete or disable the temporary bootstrap credential immediately after use. Do not commit it.

## 7. Verification and staging deployment

```bash
pnpm install --frozen-lockfile
pnpm verify
```

All mandatory checks must pass. Then run the `Deploy Firebase` workflow with `staging` and the Android release workflow with `staging`.

Complete physical tests:

- Rapid unique-card taps
- Same card held in the NFC field
- Internet outage and recovery
- Cellular outage and recovery
- Phone restart with pending queues
- Dual-SIM selection
- Card removed during writing
- Lost/replaced card
- Revoked device
- Expired offline lease
- Two phones scanning the same student

## 8. Production release

Production deployment requires:

- School privacy and legal approval
- Guardian notification process approval
- Carrier/fair-use review
- Completed Privacy Impact Assessment
- Approved retention periods
- Pilot sign-off
- Backup and restore test
- Device revocation test
- Signed release artifact
- Monitoring and incident-response contacts

Run the production workflows only through protected GitHub environments. Retain release reports, commit SHA, Firebase deployment output, APK/AAB checksum, and administrator sign-off.

## 9. Rollback

- Hosting: roll back to the previous Firebase Hosting release.
- Functions: redeploy the previous tagged commit.
- Rules: redeploy the previous reviewed rule files.
- Android: distribute the previous signed version only if its database migrations support downgrade; otherwise issue a forward-fix build.
- Do not delete local attendance or SMS outboxes during rollback.

## 10. Post-deployment monitoring

Monitor:

- Function errors and latency
- App Check rejection rate
- Device lease failures
- Attendance conflicts
- Pending/failed SMS age
- Pending sync age
- NFC write failures
- Unknown and possible-clone card events
- Android crashes
- Firestore and Functions cost alerts
