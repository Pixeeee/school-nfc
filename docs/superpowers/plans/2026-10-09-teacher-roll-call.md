# Teacher roll call implementation plan

Approved scope: teachers create sections, add students with a verified and consenting parent contact, and mark students present during roll call. SMS uses the designated Android SIM. Preserve existing NFC workflows and durable queues.

Implementation in this chat is explicitly authorized by the user.

- [x] Extend shared contracts for scoped section creation and manual ARRIVAL events without NFC cards; test validation and permissions.
- [x] Add atomic teacher section/student creation callables with school, section, device, and lease checks. Assign newly created sections only to the creating teacher and authorized phone. Test against the Firestore emulator.
- [x] Add cached section records and a non-destructive Room migration. Reuse attendance and SMS transactions for manual presence, with a mutex and the same daily duplicate key as NFC attendance.
- [x] Align cloud ingestion with existing member/device fields; accept manual ARRIVAL only and retain NFC card validation. Verify duplicate and unauthorized attendance and SMS ingestion.
- [x] Make roll call the default teacher screen, with section setup, student/parent forms, daily attendance badges, and SMS setup/status. Keep the Android bridge and browser fallback explicit.
- [x] Run TypeScript tests, type checks, builds, security checks, emulator integration tests, and Android unit tests/debug build. Inspect the UI and diff. Relevant checks passed; push the authorized feature branch after committing; report physical SIM testing separately.

Risks to test: simultaneous Present taps; unauthorized section access; network retries during student creation; unverified contacts; old database upgrades; permission denial; empty teacher scope; missing SIM; cloud result errors. Automated duplicate suppression is per phone/day and cloud/day; independent offline phones can both send before cloud synchronization, so one phone should own a section's roll call.
