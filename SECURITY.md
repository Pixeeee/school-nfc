
# Security Policy

## Reporting a vulnerability

Do not open a public issue containing student information, guardian phone numbers, credentials, card tokens, or exploitable details. Contact the repository owner privately and include the affected version, reproducible steps, impact, and a proposed mitigation if available.

## Security model

- Firestore and Storage are default-deny.
- Privileged writes pass through authenticated, App Check-protected Cloud Functions.
- Every request is validated with shared schemas and server-side authorization.
- Tenant boundaries are checked from server-owned membership records.
- NFC cards contain only a versioned school code and random token; no personal information.
- The server stores only a SHA-256 token hash after card activation.
- Android guardian numbers are encrypted at rest using an Android Keystore-backed AES-GCM key.
- Attendance, SMS, and sync outbox rows are committed atomically in Room.
- Device access expires and must be renewed; revoked devices cannot synchronize.
- Audit records are append-only from all clients.
- Production secrets and Android signing keys must never enter the repository.

## Supported releases

Only the latest production release receives security fixes during the initial rollout.

## Required production controls

1. Use separate Firebase projects for development, staging, and production.
2. Enforce Firebase App Check before importing real student data.
3. Enable MFA for platform and school administrators when available.
4. Store Function secrets in Google Secret Manager.
5. Use a private/managed Android distribution and protect the signing key.
6. Run `pnpm verify`, emulator tests, dependency audit, and the Android build before release.
7. Complete the school's privacy impact assessment and retention policy.
