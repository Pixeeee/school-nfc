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

## Live deployment pending

Firebase CLI reports no authorized accounts. EAS CLI reports Not logged in. The supplied configuration is for a web app, not the Android registration. No Firebase rules, school records or Expo cloud build have been deployed to the target accounts. No billing account has been enabled or linked.

To finish, sign in locally to Firebase and Expo, register the Android app `com.pixeeee.schoolnfc`, provide its google-services.json, and link the existing Expo project UUID. The trusted local administrator setup also needs appropriate administrator credentials and the school/teacher Auth accounts. A release keystore and EAS file/string secrets are required for the signed downloadable APK. Instructions are in [Spark setup](docs/SPARK_SETUP.md).

The supplied local Spark debug APK is an unconfigured test artifact and shows connection-required guidance until rebuilt with the Android Firebase configuration. It is not a live school service. Cloud EAS custom-build execution and release signing remain unverified until account configuration is complete.

Firebase Spark and Expo Free quotas apply; do not upgrade when a quota is exhausted. Carrier SMS consumes prepaid load. Use one phone per section while offline to avoid duplicate SMS across disconnected devices. Offline cached authorization can last up to six days; existing quarantined records require administrator review and may remain in local queue counters. Spark does not deploy the original Functions-dependent admin website or issue new NFC cards; teacher setup is through the trusted local tool, with manual roll call and scoped existing-card reads in the app.
