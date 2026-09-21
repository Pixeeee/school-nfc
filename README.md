# School NFC Attendance

A production-oriented, offline-first school attendance platform. Authorized staff write secure random identifiers to NFC cards with the Android app. Students tap a teacher phone; attendance is committed locally immediately; parent SMS messages and Firebase synchronization continue in independent durable queues.

## Applications

| Application | Purpose |
|---|---|
| `apps/admin-web` | Responsive school administration portal |
| `apps/teacher-mobile` | React/Capacitor teacher UI plus native Android NFC/SMS implementation |
| `apps/functions` | Trusted Firebase callable functions and ingestion boundary |
| `packages/contracts` | Shared schemas, domain rules, idempotency, phone and NFC utilities |
| `packages/rules-tests` | Firestore and Storage Rules emulator tests |

## Critical architecture

```text
NFC callback
  -> local card validation
  -> one Room transaction
       attendance event
       SMS outbox item(s)
       Firebase sync outbox item
  -> beep/vibrate/result
  -> ready for the next card

SMS sender and Firebase synchronization run independently.
```

The NFC callback never waits for Firebase or the cellular carrier.

## Security baseline

- No student or guardian personal information is written to an NFC card.
- NFC cards contain a versioned school code and a cryptographically random token.
- The cloud stores only a token hash.
- Card writes require an authorized user, approved device, active device lease, write verification, and server activation.
- Firestore and Storage Rules default to deny.
- Sensitive state transitions use App Check-protected callable Functions.
- Attendance idempotency is recomputed by the server.
- Device, lease, card/student mapping, section scope, and event permission are verified server-side.
- Guardian phone numbers must be explicitly verified and consent recorded before SMS reporting is accepted.
- Guardian destinations cached on Android are encrypted with an Android Keystore AES-GCM key.
- SMS and sync outboxes survive process death and restart.
- Device authorization expires and can be revoked.
- Audit records are append-only from client applications.

See [`SECURITY.md`](SECURITY.md), [`docs/SECURITY_CHECKLIST.md`](docs/SECURITY_CHECKLIST.md), and [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Requirements

- Node.js 22+
- pnpm 10.17.1
- Java 21 for Firebase Emulator/Functions checks
- Java 17 and Android SDK for Android builds
- Firebase CLI
- Android phone with NFC and an SMS-capable SIM
- NDEF-compatible NFC cards, such as NTAG213/215/216

## Local setup

```bash
git clone https://github.com/Pixeeee/school-nfc.git
cd school-nfc
corepack enable
pnpm install --frozen-lockfile
cp .firebaserc.example .firebaserc
cp apps/admin-web/.env.example apps/admin-web/.env.local
```

Add a development Android Firebase configuration at:

```text
apps/teacher-mobile/android/app/google-services.json
```

This file is ignored by Git.

Start Firebase emulators:

```bash
pnpm exec firebase emulators:start --project demo-school-nfc
```

Start the administration portal:

```bash
pnpm --filter @school-nfc/admin-web dev
```

Build and synchronize the Android project:

```bash
pnpm --filter @school-nfc/teacher-mobile build
pnpm --filter @school-nfc/teacher-mobile exec cap sync android
cd apps/teacher-mobile/android
./gradlew assembleDebug
```

## Verification

Run the complete release gate:

```bash
pnpm verify
```

Individual checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:check
pnpm test:rules
pnpm audit --prod --audit-level high
```

The verification report is written to:

```text
reports/release-verification/REPORT.md
```

## Firebase environments

Use separate Firebase projects for:

```text
development
staging
production
```

Never use production student data in development. Follow [`docs/FIREBASE_SETUP.md`](docs/FIREBASE_SETUP.md).

## Bootstrap

1. Create Firebase projects and web/Android applications.
2. Configure Authentication, Firestore, Storage, Functions, Hosting, and App Check.
3. Set the initial platform administrator with `scripts/set-platform-admin.mjs`.
4. Create the first school using `scripts/bootstrap-school.mjs` or the protected bootstrap callable.
5. Register and approve teacher phones.
6. Select and test the SMS SIM.
7. Import students and guardians.
8. Verify guardian numbers and record notification consent.
9. Issue and verify cards through the Card Manager.
10. Run a controlled pilot before school-wide deployment.

## Deployment

Firebase and signed Android releases are provided through GitHub Actions:

- `CI`
- `Deploy Firebase`
- `Build Signed Android Release`

The workflows require environment-scoped GitHub secrets. They do not store Firebase service-account JSON or Android signing keys in the repository. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Direct SIM SMS distribution

The initial release is intended for private school-managed installation or managed enterprise distribution. Automated SIM SMS requires sensitive Android permissions and a school/carrier policy review. Verify that the selected cellular plan permits the expected automated traffic before production use.

## Application ID

```text
com.pixeeee.schoolnfc
```

Register this exact Android application ID in every Firebase environment.

## License

See [`LICENSE`](LICENSE).
