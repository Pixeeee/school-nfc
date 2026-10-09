# No-billing Firebase deployment

User requires Firebase Spark, no billing account. Keep the Android Capacitor app and real SIM sender; do not deploy Functions or Storage. Use separate Spark collections to avoid weakening the original Function-only collections.

- Implement a native Firestore gateway for teacher setup, pending device registration, approved-device renewal, section/student creation, scoped snapshots, immutable attendance and SMS status synchronization.
- Enforce active membership, approved device, section ownership and atomic student-number uniqueness in dedicated Spark rules. Parent contact stays inside its scoped student document. Existing paid-backend rules remain unchanged.
- Provision school metadata, teachers and device approvals through a local trusted administrator CLI. Email/password Auth is configured in the Firebase console. No client can grant itself membership or device approval.
- Prepare Expo EAS generic native APK distribution, signing and no-Functions/no-Storage deployment configuration. Keep browser admin deployment out of Spark: it depends on the paid backend; local CLI covers required setup.
- Test denied cross-school/cross-section writes, no self-approval/escalation, validation, immutable attendance, SMS bounds, exact atomic number reservation, native gateway round trips and offline duplicate queueing. Build APK and report deployment pending project/account configuration.

Spark limitations: client timestamps are device-reported, with server receipt timestamps stored separately. Firestore rules authorize each write but cannot prove a physical SMS was delivered. One phone per offline section prevents duplicate texts before reconciliation. NFC card issuance is handled only by the original Functions backend; Spark keeps existing NFC reads and manual teacher attendance, with unsupported card issuance clearly hidden.
