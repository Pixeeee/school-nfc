# Firebase Spark and downloadable Expo APK

This deployment uses Firebase Spark without a billing account. Authentication and Firestore provide school data; Android sends parent SMS using the selected prepaid SIM. There are no deployed Functions or Storage resources, Firebase phone authentication, or Firebase SMS charges. Carrier SMS still consumes the SIM's balance/plan.

## Your projects

- Firebase: `schoolattendance-16d6d`
- Expo: `pixeee/attendance-check`
- Android package: `com.example.attendance_check`

Keep Firebase on Spark and Expo on Free. Firebase may stop serving when its free quotas are exhausted. Expo cloud builds have a free quota and queue; wait for reset rather than upgrading. This configuration does not enable billing.

## Configure Firebase

1. Enable Email/Password under Authentication → Sign-in method. Create the administrator and teacher accounts in the console; do not send their passwords to an agent.
2. Create the default Cloud Firestore database in production mode. Choose its location before creation; it cannot be changed afterward. Do not enable Storage or Cloud Functions.
3. Register an Android app with the package above. Download `google-services.json` to `apps/teacher-mobile/android/app/google-services.json` (ignored by Git). The web Firebase snippet is not the Android registration.
4. Sign in locally: `pnpm exec firebase login`.
5. Deploy only the Spark rules and indexes: `pnpm deploy:spark schoolattendance-16d6d`. This command never includes Functions or Storage.

Spark writes depend on these dedicated rules; do not deploy `firebase.json` over this project, because its original rules block the direct teacher workflow. The original admin web app depends on Functions and is not part of Spark deployment. Use the local setup tool and Firebase console instead.

## Provision school and approve phones

The local script uses trusted Firebase administrator credentials. Configure Application Default Credentials on your computer, or point `GOOGLE_APPLICATION_CREDENTIALS` to a local service-account file. Never commit or paste private administrator keys. Firebase CLI login is separate from administrator SDK credentials. The script only calls Auth and Firestore; it creates no billable compute resource.

After creating the administrator Auth account:

```bash
node scripts/setup-spark.mjs school schoolattendance-16d6d myschool "School Name" admin@example.com "2026-2027" "Grade 7"
node scripts/setup-spark.mjs teacher schoolattendance-16d6d myschool teacher@example.com
node scripts/setup-spark.mjs devices schoolattendance-16d6d myschool
node scripts/setup-spark.mjs approve schoolattendance-16d6d myschool DEVICE_ID TEACHER_UID
```

The teacher signs into the app, enters school ID `myschool` and a phone name, and registers the phone. Approve the pending phone with its exact teacher UID. The teacher then renews authorization and can create their own section and student/parent records. Add more active grades and academic years in the console as needed. To revoke a phone, use the same script with `revoke`.

Each student stores one parent route in its scoped document. Student numbers are canonical uppercase letters, digits, dashes and underscores. Student creation and number reservation are atomic and retry-safe. Parent numbers require teacher verification and recorded consent.

## Build and distribute through Expo EAS

This is a Capacitor Android app, not Expo Go. EAS runs a custom native build and produces a standalone installable APK while retaining the native Room queue, WorkManager and SmsManager code. Expo is only the build/distribution service; the UI does not require a React Native migration.

Run EAS CLI from `apps/teacher-mobile`, where app.json, eas.json and .eas/build live:

```bash
npx eas-cli login
npx eas-cli init
```

Link the existing `pixeee/attendance-check` project; do not create a duplicate. EAS records its UUID in `expo.extra.eas.projectId`. The `preview` build uses local signing material through the existing Gradle environment inputs. Generate an Android release keystore locally once (keep it backed up), or use the school's existing keystore. Supply these EAS preview environment variables through the dashboard:

| Variable                     | Type                                         |
| ---------------------------- | -------------------------------------------- |
| GOOGLE_SERVICES_JSON         | File, the registered Android Firebase config |
| SCHOOL_NFC_KEYSTORE_PATH     | Secret file, Android release keystore        |
| SCHOOL_NFC_KEYSTORE_PASSWORD | Secret string                                |
| SCHOOL_NFC_KEY_ALIAS         | Secret string                                |
| SCHOOL_NFC_KEY_PASSWORD      | Secret string                                |

The build fails rather than producing an unsigned release if these are missing. Start the cloud build with:

```bash
npx eas-cli build --platform android --profile preview
```

EAS provides an APK download/install link when the build succeeds. Use that APK on a physical Android phone, enable SMS/phone permissions, and select the prepaid SIM. No development server or Expo Go is required. Verify a test SMS only to a number you control, then check carrier balance and delivery behavior before contacting parents.

App Check setup is separate from Firestore rules. Register the Android signing fingerprint and configure a supported provider before enabling Firestore enforcement. Debug builds require registered debug tokens when enforcement is enabled. Do not enable enforcement before the first device is configured.

## Testing and limits

Dedicated Spark rules emulator tests cover cross-school/section denial, self-approval/escalation denial, atomic number uniqueness, invalid parent contact/consent, immutable attendance and SMS ownership/bounds. Android instrumentation exercises the real Firestore adapter and Room snapshot cache against local Auth and Firestore emulators; it sends no SMS.

No service can prove physical attendance or SMS delivery from an untrusted client. Records include a server receipt timestamp and device-reported local time. Use one phone per section when offline: two disconnected phones can each send before cloud reconciliation. Membership or device revocation takes effect online immediately, but an offline phone retains its cached authorization until expiry (up to six days). Upgrades invalidate old authorization and clear cached roster data when the owner/backend changes. Existing attendance and SMS evidence is retained and quarantined by backend/account, not deleted or replayed to new parents. A trusted administrator must review old pending records; their counters may remain visible.
