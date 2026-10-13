# SIM texting and permissions — Android 1.5.1

In **Settings**, tap **Allow SMS & phone access**, then allow both permissions in
Android's permission pop-ups. Choose the intended carrier/slot under **Active
SIM**. The app requires Android 8 or newer and a phone capable of SIM texting.

The app now checks SMS and Phone permission together, refreshes SIM availability
when you return to the app, and validates the chosen subscription before sending.
An absent, disabled, or removed SIM pauses sending while preserving queued texts.
Selecting an active SIM schedules fresh work without placing it behind a setup
failure's retry delay. Attendance recording remains available while texting is
unavailable.

If Android permanently blocks permission requests, the app displays an explanation
beside the Allow button and offers **Open app permissions**. The app cannot force
Android to display a blocked prompt or bypass an installer/device restriction on
SMS. See Android's [runtime permission documentation](https://developer.android.com/training/permissions/requesting)
and [SEND_SMS permission reference](https://developer.android.com/reference/android/Manifest.permission#SEND_SMS).

## Verification

- Reproduced the previous false-ready state with a real native bridge test:
  SMS allowed + Phone denied incorrectly reported readiness.
- Reproduced missing blocked-permission recovery in the interface and bridge.
- 33 teacher-interface tests pass, including permission grant, inline blocked
  recovery, permission changes on resume, newly enabled SIM discovery, and SIM
  lookup failures. Type checking and production web build pass.
- Four native permission/SIM cases pass on Android 13 and Android 16 emulators:
  actual Android pop-ups, both grants, partial denial, blocked requests, and
  inactive subscription rejection. The app remains open.
- A real WorkManager test on Android 13 confirms missing/inactive subscriptions
  finish setup work without losing the queued message or consuming send attempts.
- Existing Android JVM tests pass; the Android app and instrumentation APK build.
- Focused code review found no remaining blocker after queue recovery and resume
  refresh corrections.

Emulators do not verify prepaid balance, cellular reception, manufacturer-specific
restrictions, or physical delivery. Use **Queue test message** with a number you
control, then check the receiving phone. A queued or sent status does not establish
delivery. Carrier load/SMS allowance and carrier support are still required.

Version **1.5.1**, Android version code **8**. No billing or Firebase configuration
changes are required for this release.
