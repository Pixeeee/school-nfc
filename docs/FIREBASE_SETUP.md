
# Firebase Configuration

## Collections

All tenant records live under `schools/{schoolId}`. A mirrored membership document under `users/{uid}/schoolMemberships/{schoolId}` lets the signed-in user discover only their own school workspaces.

Privileged writes are callable Functions only. Browser clients cannot directly create students, guardians, cards, attendance, SMS logs, device leases, corrections, settings, or audit entries.

## App Check

Functions use `enforceAppCheck: true`. Debug tokens are allowed only in local/development configuration. Register production Admin domains and Android signing fingerprints before enabling enforcement for real users.

## Indexes

Deploy `firebase/firestore.indexes.json` before production import. Sensitive hashes, full guardian phone numbers, rendered SMS bodies, and audit before/after objects are excluded from automatic indexing where practical.

## Emulator tests

```bash
pnpm test:rules
```

The test suite proves unauthenticated denial, tenant isolation, teacher section scope for direct reads, Function-only writes, and append-only audit behavior.
