# No-billing deployment readiness

Target Firebase project: `schoolattendance-16d6d`. Target Expo project: `pixeee/attendance-check`.

## Implemented and verified

The Android app defaults to Firebase Spark. It uses Firebase Email/Password Auth and dedicated Firestore collections/rules for the teacher workflow; it does not call deployed Cloud Functions. The Spark deploy command targets only Firestore rules and indexes, with no Functions or Storage deployment. Parent contact is scoped to the student's section. School memberships and phone approvals remain trusted administrator operations.

The native queue still sends through Android SmsManager and the selected prepaid SIM. An authorization lease and cached roster are bound to the Firebase user, school and backend. Room schema 3 preserves existing attendance/SMS evidence; legacy records are quarantined rather than replayed under a new account or backend. Orphan SMS results from a duplicate attendance conflict are terminal, so they cannot block other messages' synchronization.

The Expo custom-native build retains Capacitor, Room, WorkManager and the Kotlin SMS bridge, selects Java 21, requires Firebase Android registration and signing files, and uploads a standalone APK. EAS CLI configuration schema validation passed. It is not an Expo Go app.

## Test results

- 28 JavaScript unit tests passed.
- 7 existing Functions integration tests passed (legacy backend regression checks, not a Spark deployment).
- 16 Firestore rules tests passed: 5 legacy boundaries and 11 dedicated Spark tests.
- 2 native JVM policy tests passed.
- 4 Android 13 instrumented tests passed, including real Auth/Firestore gateway round trips, Room migration, bridge serialization, 12 concurrent Present taps, owner/backend isolation, retry-safe student creation and duplicate/orphan handling.
- Frozen install, formatting, lint, typecheck, production builds, security check, whitespace/conflict checks and high-severity production audit passed. One moderate dependency advisory remains.
- Native debug and unsigned release APK builds and release lint passed.
- Focused review found no remaining blockers after fixes.

Total: 57 distinct automated tests passed. Physical SMS was not sent during testing.

## Expo APK published

Expo build `4b631820-68cb-468f-8d2c-ce7a510c709f` succeeded on October 9, 2026. The existing project UUID is `9d8e772f-8e5d-45e0-bea5-c8dcd59651e0`; no duplicate project was created. The build runs release unit tests and assembles a signed APK, using the supplied Firebase Android registration for `com.example.attendance_check`. The published APK was downloaded and its v2 signature verified. Release signing files/passwords are stored as secret preview environment variables, outside source control. No billing account was enabled or linked.

[Install from Expo](https://expo.dev/accounts/pixeee/projects/attendance-check/builds/4b631820-68cb-468f-8d2c-ce7a510c709f). [Direct APK](https://expo.dev/artifacts/eas/fWL_kxEmYchZkwPG19m8QdeEMFlOhfZBqqKoJbEoPGs.apk). Expo reports this artifact expires October 23, 2026. A local copy is also saved as `../school-attendance-expo.apk`. Uninstall the earlier debug app before installing this release because its signing key differs; preserve any needed local attendance evidence first.

EAS custom-build execution exposed three integration issues, now fixed: repeated/compact Gradle defaultConfig blocks confused package detection, worker JVM defaults included the obsolete MaxPermSize flag, and artifact upload paths resolve from the monorepo root. The successful cloud build includes all three corrections.

## Firebase administration pending

The APK includes the correct Firebase connection. Live Firebase rules, Email/Password Auth, school records, teacher memberships and device approval have not been verified in the target project. Firebase CLI previously reported no authorized account. Trusted administrator credentials are still required to provision the school/teacher and deploy Spark rules/indexes; instructions are in [Spark setup](docs/SPARK_SETUP.md). APK publication does not provision these records.

Physical SIM SMS delivery remains untested. The successful cloud build runs JVM unit tests; Android 13 instrumented checks were performed locally during the implementation rather than on the Expo worker.

Firebase Spark and Expo Free quotas apply; do not upgrade when a quota is exhausted. Carrier SMS consumes prepaid load. Use one phone per section while offline to avoid duplicate SMS across disconnected devices. Offline cached authorization can last up to six days; existing quarantined records require administrator review and may remain in local queue counters. Spark does not deploy the original Functions-dependent admin website or issue new NFC cards; teacher setup is through the trusted local tool, with manual roll call and scoped existing-card reads in the app.
