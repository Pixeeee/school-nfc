# Teacher roll call verification

Verified locally on 2026-10-09 for branch `feat/teacher-roll-call`.

## Implemented

- Teachers create sections scoped to their membership and approved device.
- Student creation atomically saves the student, checked parent contact, recorded consent, guardian link, and enrollment. Network retries use stable request IDs.
- Manual Present records an ARRIVAL and queues the parent SMS in the same Room transaction. NFC and manual attendance share the daily duplicate key.
- Android sends queued SMS through the selected SIM using its carrier balance or SMS plan. The UI distinguishes queueing, sending, delivery and failure.
- Roll call, NFC, Cards, Messages and Settings have separate screens; student and section forms, native bridge, local persistence and cloud callables are separate modules.

## Passing verification

| Check                                                             | Result                                       |
| ----------------------------------------------------------------- | -------------------------------------------- |
| Frozen dependency installation, formatting, lint, TypeScript      | PASS                                         |
| JavaScript unit tests                                             | 27 passed                                    |
| Firestore teacher integration tests                               | 7 passed                                     |
| Firestore rules tests (Firestore and Storage emulators running)   | 5 passed                                     |
| Android JVM policy tests                                          | 2 passed                                     |
| Android 13 instrumented tests                                     | 3 passed                                     |
| Admin web, teacher web, contracts and functions production builds | PASS                                         |
| Android debug and unsigned release APK builds, release lint       | PASS                                         |
| Static security check, whitespace and conflict-marker checks      | PASS                                         |
| Production dependency audit at high severity                      | PASS; one moderate advisory remains          |
| Synthetic browser UI checks at 390px and 320px                    | PASS; no overflow or browser errors          |
| Android launch without Firebase configuration                     | PASS; connection-required guidance displayed |
| Focused code review                                               | No remaining blockers                        |

The 44 distinct automated tests cover permissions, invalid contacts, consent, idempotent creation, simultaneous attendance submissions, manual/NFC validation, real Android Room migration, recursive bridge serialization, and 12 simultaneous Present taps producing exactly one attendance event and one parent SMS. The standalone unit command skips emulator-only tests; those were run separately and passed.

The browser previews use synthetic student data and a simulated native bridge. Native instrumentation exercises the real bridge serialization, database and attendance repository. It does not send an SMS.

## Live-use requirements and limits

Firebase project configuration, deployment, approved accounts/devices, and release signing credentials were not supplied. The supplied debug APK is a build artifact and shows connection-required guidance until rebuilt with the school's Firebase configuration. It is not a deployed school service.

Physical SIM delivery, carrier load deduction, dual-SIM behavior and OEM background restrictions require a real Android phone. The app uses existing SMS load; it neither buys load nor checks remaining load. No real parent was messaged during testing. Production release signing was not exercised.

Use one attendance phone per section while offline: separate offline phones may each send an SMS before cloud duplicate reconciliation. Existing cloud memberships must contain canonical `effectivePermissions` and `sectionIds`; provision through the current admin/bootstrap workflow before rollout.
