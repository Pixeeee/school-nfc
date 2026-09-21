
# Security Release Checklist

- [ ] `pnpm verify` passes from a clean checkout.
- [ ] `pnpm test:rules` passes against Firebase emulators.
- [ ] Production App Check is enforced and debug providers are rejected.
- [ ] No service account, API key, private key, signing key, card token, parent number, or real student fixture is committed.
- [ ] School creation is limited to the bootstrap/platform-admin path.
- [ ] Every Function verifies Authentication, membership, permission, tenant, and device lease as applicable.
- [ ] Card activation requires a one-time reservation, approved device lease, write/read-back verification, and expiration check.
- [ ] NFC cards contain no PII.
- [ ] SMS destination numbers are masked in ordinary UI and encrypted locally.
- [ ] Firestore/Storage Rules default to deny.
- [ ] Audit logs are client read-only.
- [ ] Lost-card and lost-device revocation are tested.
- [ ] Offline device authorization expires.
- [ ] Android backup/data transfer excludes local databases and preferences.
- [ ] Android signing key and Firebase secrets are stored outside source control.
- [ ] Dependency audit has no unresolved high/critical production finding.
- [ ] Threat model and privacy impact assessment are signed off.
