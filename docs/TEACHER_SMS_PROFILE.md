# Teacher SMS profile — Android 1.5.0

In **Settings → Teacher profile**, enter **Username in texts** and **School**, then
tap **Save profile** while connected. These fields describe the sender in parent
messages; they do not change the teacher's login username, password, or school
membership.

Firebase stores each profile under the teacher's own school and account. Only
that active account can read or update its profile. The Android app caches the
last confirmed profile for offline attendance. An offline save reports an error
and does not replace the confirmed profile.

New attendance and dismissal messages include the saved school and teacher
username. Attendance status, recorded date/time, and subject schedules remain in
the message. Previously queued messages retain their original text. Test SMS
also uses the saved sender details. Physical SIM texts consume the SIM's prepaid
load or SMS allowance.

## Verification

- Teacher interface: 28 passing tests and successful type checking.
- Firebase rules: 25 passing emulator tests, including private profile access,
  suspension, cross-account access, and invalid payload rejection.
- Function integration: 9 passing emulator tests.
- Android: 4 passing JVM tests and 5 passing instrumentation tests, including
  Firebase save/read, offline caching, rejected offline saves, account/school
  isolation, and sender details across attendance choices.
- Workspace lint, type checking, tests, builds, formatting, and security checks
  passed. The dependency audit passed the high-severity gate; one pre-existing
  moderate advisory remains.
- Production Spark Firestore rules were deployed without enabling billing.
- Physical SIM delivery was not retested for this release.

## GitHub Actions limitation

The reported run `38207391631` never started either job. GitHub's annotation says
the account is locked due to a billing issue. Repository code cannot remove this
account restriction; the repository owner must resolve it with GitHub. No billing
was enabled. Both CI runners now use Ubuntu 24.04, and pre-existing formatting
failures were corrected so the checks are ready once GitHub permits jobs to run.
Equivalent checks were run locally; this does not make the blocked hosted run
successful.

This release uses version name **1.5.0** and Android version code **7**, retaining
the existing application ID and data schema.
