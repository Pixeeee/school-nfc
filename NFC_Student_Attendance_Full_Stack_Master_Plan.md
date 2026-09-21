# NFC Student Attendance and Parent SMS
## Full-Stack Master Implementation Plan

**Plan version:** 1.0  
**Prepared:** September 18, 2026  
**Status:** Implementation-ready architecture plan; no application code included  
**Primary deployment:** Privately distributed or school-managed Android application  
**Primary users:** Teachers, registrars, school administrators, and authorized auditors

---

## 1. Product Goal

Build a production-ready school attendance platform in which:

1. An authorized staff member registers a student and guardian.
2. The same Android application writes a secure identifier to the student's NFC card.
3. A teacher starts an Arrival, Dismissal, or other authorized scanner session.
4. Students tap their NFC cards against the teacher's Android phone one after another.
5. Every accepted scan is committed locally immediately.
6. The next student can tap without waiting for Firebase or SMS.
7. A background SMS queue sends a notification through the teacher phone's selected SIM.
8. Attendance, card activity, SMS status, and audit records synchronize to Firebase.
9. Administrators manage the system through a responsive React web portal.
10. The system continues recording attendance during an internet outage and recovers safely after restart.

### Non-negotiable behavior

```text
NFC TAP
   ↓
LOCAL CARD VALIDATION
   ↓
LOCAL ATTENDANCE TRANSACTION
   ├── Attendance event
   ├── SMS outbox item
   └── Firebase sync outbox item
   ↓
BEEP + VIBRATION + LARGE RESULT
   ↓
READY FOR NEXT CARD

SMS sending and Firebase synchronization continue independently.
```

A slow carrier, weak internet connection, Firebase outage, or pending SMS must never block the next NFC scan.

---

## 2. Locked Architecture

A browser-only React application is not sufficient for reliable NFC writing, SIM selection, automatic SMS, process recovery, and durable local queues. The system will use React for the user interface and native Kotlin for device capabilities.

```text
┌──────────────────────────────────────────────────────────────┐
│                         FIREBASE                             │
│ Authentication • Firestore • Functions • Storage • Hosting │
│ App Check • Crash Reporting • Monitoring                   │
└──────────────────────────┬───────────────────────────────────┘
                           │ secure synchronization
             ┌─────────────┴──────────────┐
             │                            │
             ▼                            ▼
┌─────────────────────────────┐  ┌────────────────────────────┐
│ TEACHER ANDROID APP         │  │ RESPONSIVE ADMIN WEB      │
│                             │  │                            │
│ React + TypeScript          │  │ React + TypeScript        │
│ Capacitor Android shell     │  │ Firebase web client       │
│ Native Kotlin domain layer  │  │ Firebase Hosting          │
│ Room local database         │  │                            │
│ NFC reader and writer       │  │ Users, students, cards,   │
│ SMS queue and sender        │  │ attendance, SMS, reports  │
│ Sync outbox                 │  │ and audit administration  │
└──────────────┬──────────────┘  └────────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
  NFC student card   Teacher SIM
                         │
                         ▼
                       Parent
```

### Platform scope

- **Teacher scanner/writer:** Android only for the first production release.
- **Admin portal:** Responsive web application for desktop, tablet, and mobile browsers.
- **Student app:** Not required.
- **Parent app:** Not required; parents receive standard SMS.
- **iPhone teacher scanner:** Out of scope for the first release because automatic background SIM SMS and Android-equivalent hardware control are not part of this architecture.
- **Internet:** Required for initial device authorization, staff administration, card issuance, and cloud synchronization. Attendance scanning remains operational offline after the device has a valid local snapshot and authorization lease.
- **Cellular SMS signal:** Required only to transmit SMS. Failed or delayed messages remain in the durable outbox.

---

## 3. Recommended Technology Baseline

Exact dependency versions must be pinned in lockfiles at implementation kickoff and updated only through reviewed dependency pull requests.

| Area | Baseline |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Admin UI | React 19.x, TypeScript, Vite |
| Mobile UI | React 19.x, TypeScript, Vite |
| Native wrapper | Capacitor 8 |
| Android native code | Kotlin, latest stable Android toolchain |
| Android minimum | `minSdk 26` unless pilot hardware requires a higher floor |
| Android target | Latest stable target SDK required at release time |
| Local database | Room |
| Immediate processing | Kotlin coroutines + controlled in-app/foreground queue service |
| Persistent recovery | WorkManager |
| Forms | React Hook Form |
| Shared validation | Zod |
| Server state | TanStack Query |
| Local React UI state | Zustand or narrowly scoped React state |
| Routing | React Router |
| Admin tables | TanStack Table |
| Styling | Tailwind CSS + shared accessible component library |
| Cloud auth | Firebase Authentication |
| Cloud database | Cloud Firestore |
| Backend | Cloud Functions for Firebase, TypeScript |
| Files | Cloud Storage for Firebase |
| Web deployment | Firebase Hosting |
| Abuse protection | Firebase App Check, device authorization, rate controls |
| Monitoring | Firebase Crashlytics, Performance Monitoring, structured logs |
| Web tests | Vitest, Testing Library, Playwright |
| Firebase tests | Emulator Suite + Security Rules tests |
| Android tests | JUnit, Room tests, WorkManager tests, instrumentation tests |
| CI/CD | GitHub Actions or equivalent |

---

## 4. Product Scope

### 4.1 Included in the first complete production release

- School/tenant configuration
- User authentication
- Role-based authorization
- Device registration, approval, suspension, and revocation
- Academic years, grade levels, sections, and teacher assignments
- Student CRUD
- Guardian CRUD
- Student-to-guardian relationships
- Philippine mobile number normalization and validation
- Parent notification preferences and consent status
- Student photo management
- NFC card inventory
- NFC card read, format, write, verify, test, assign, replace, disable, reactivate, clear, and retire
- Arrival, Dismissal, and Custom attendance sessions
- Fast continuous NFC scanning
- Per-card debounce and business-level duplicate prevention
- Offline local attendance storage
- Background SIM SMS outbox
- Dual-SIM selection
- SMS sent/delivery/failure status tracking where supported
- Persistent retry after app or phone restart
- Firebase batch synchronization
- Multi-device idempotency
- Responsive administration dashboard
- Attendance and SMS reports
- Manual corrections with reasons and audit history
- Data import/export
- Security Rules and App Check
- Complete audit logs
- Production builds and operational documentation

### 4.2 Explicitly excluded from the first release

- Biometric verification
- Facial recognition
- GPS tracking of students
- Automatic proof that the person holding the card is the real student
- iOS-based automatic SMS sender
- Parent mobile app
- Student mobile app
- Public Google Play distribution as the default channel
- Cloud SMS provider
- Hardware turnstiles or dedicated NFC gates
- Payroll, grading, enrollment billing, or full student information system features

The architecture must allow these to be added later without rewriting attendance, cards, or messaging.

---

## 5. Core Roles and Permissions

### 5.1 Roles

1. **Platform Super Admin**
   - Manages all school tenants and platform configuration.
   - Not intended for ordinary school employees.

2. **School Admin**
   - Full control within one school.
   - Manages users, devices, settings, templates, reports, and audit records.

3. **Registrar / Card Issuer**
   - Manages students, guardians, enrollment, photos, and NFC cards.
   - Can write and replace cards if granted the `nfc.write` permission.

4. **Teacher / Scanner Operator**
   - Runs assigned scanner sessions.
   - Views only students and attendance within permitted scope.
   - Cannot silently alter historical attendance.

5. **Attendance Officer**
   - Reviews attendance and performs authorized corrections.
   - Corrections require reason, actor, timestamp, and before/after values.

6. **Auditor / Viewer**
   - Read-only access to permitted reports and audit records.

### 5.2 Permission model

Use granular permissions rather than hard-coding behavior only by role:

```text
school.read
school.settings.manage

user.read
user.invite
user.role.manage

student.read
student.create
student.update
student.archive

guardian.read
guardian.create
guardian.update

nfc.read
nfc.write
nfc.replace
nfc.disable
nfc.reactivate
nfc.clear

scanner.start
scanner.arrival
scanner.dismissal
scanner.custom

attendance.read
attendance.correct
attendance.export

sms.template.manage
sms.read
sms.retry
sms.cancel

device.read
device.approve
device.suspend
device.revoke

audit.read
report.read
report.export
```

Every operation must be authorized by school membership, permission, resource scope, and device state.

---

## 6. Major Application Modules

### 6.1 Authentication and account security

- Login
- Logout
- Password reset
- Session renewal
- Optional admin MFA
- Disabled-user handling
- Expired-session handling
- Device binding for the mobile app
- School selection for users with multiple memberships
- Forced logout after user suspension
- Audit trail for security-sensitive account changes

### 6.2 School and academic configuration

- School identity and branding
- Time zone; default `Asia/Manila`
- Academic year
- Grade levels
- Sections/classes
- Class schedules
- Arrival cut-off and late rules
- Dismissal schedules
- SMS sender school name
- Retention policy
- Offline authorization lease duration
- Default debounce interval
- Default SIM setting per device

### 6.3 Student management

- Student number
- First, middle, last name, and suffix
- Preferred display name
- Photo
- Grade level and section
- Academic status
- Enrollment status
- Active card
- Guardian relationships
- Search, filter, pagination, bulk import, archive, and restore

### 6.4 Guardian management

- Guardian name
- Relationship to student
- Philippine mobile number
- Normalized E.164 number
- Verification status
- Primary/secondary notification status
- Arrival notification preference
- Dismissal notification preference
- Late notification preference
- Custom event preference
- Consent and privacy notice acknowledgment
- Multiple students per guardian
- Multiple guardians per student

### 6.5 NFC Card Manager

Functions comparable to the required portion of an NFC Tools application:

- Detect NFC support
- Detect whether NFC is enabled
- Read tag technology
- Read existing NDEF records
- Determine whether a tag is NDEF-formatted
- Format a supported blank tag
- Check writability
- Check capacity
- Write the application payload
- Read the payload back
- Verify exact content
- Assign card to a student
- Test active card
- Replace lost card
- Disable card
- Reactivate eligible card
- Clear reusable card
- Retire damaged/read-only card
- Show card history
- Prevent accidental overwrite
- Maintain card inventory status

### 6.6 Attendance scanner

- Arrival mode
- Dismissal mode
- Custom session mode
- Section-scoped or school-wide scanning
- Fast native NFC loop
- Local card resolution
- Student photo/name result
- Per-card debounce
- Daily/session idempotency
- Unknown-card handling
- Disabled/lost-card handling
- Out-of-scope student handling
- Local attendance transaction
- Audio/haptic/visual feedback
- Recent scan list
- Present/late/dismissed counts
- SMS queue count
- Sync queue count
- Offline indicator
- Manual fallback search with permission

### 6.7 SMS subsystem

- Select physical SIM/eSIM subscription
- Test SMS
- Template editor
- Placeholder validation
- Queue creation in the attendance transaction
- Immediate sequential sender
- Sent callback
- Delivery callback where carrier/device supports it
- Retry and backoff
- Final failure classification
- Manual retry
- Duplicate-message prevention
- Queue health dashboard
- Per-device and per-school sending limit safeguards

### 6.8 Firebase synchronization

- Initial authorized device snapshot
- Delta master-data updates
- Attendance event upload
- SMS result upload
- Card status refresh
- User/device revocation refresh
- Retry and backoff
- Batch upload
- Idempotent ingestion
- Conflict result handling
- Reconciliation screen

### 6.9 Administration and reports

- Dashboard
- Students
- Guardians
- Classes
- Teachers
- Devices
- NFC cards
- Attendance events
- Daily attendance
- SMS outbox/log
- Failed SMS
- Audit trail
- Settings
- CSV/Excel-compatible export
- Printable/PDF reporting phase
- Data correction workflow

---

## 7. Fast Scan Architecture

The time-critical path must run in native Kotlin, not through a network request and not as a long React callback.

### 7.1 Native scan transaction

```text
Android NFC callback
   ↓
Parse compact payload
   ↓
Hash token
   ↓
Look up active card in Room
   ↓
Check local device lease
   ↓
Check session scope and mode
   ↓
Check in-memory per-card debounce
   ↓
Check persisted attendance idempotency
   ↓
BEGIN ROOM TRANSACTION
   ├── Insert attendance event
   ├── Insert one SMS outbox item per eligible guardian
   └── Insert Firebase sync outbox item
   ↓
COMMIT
   ↓
Emit accepted result to React
   ↓
Beep/vibrate/show student
   ↓
Release reader for next tag
```

### 7.2 Rules

- Never query Firebase in the NFC callback.
- Never wait for `SmsManager` in the NFC callback.
- Never navigate away from the scanner page after a scan.
- Never apply a global scanner delay.
- Apply debounce per card token only.
- Keep the latest-result animation independent of reader readiness.
- Use a single local database transaction so partial state cannot occur.

### 7.3 Performance acceptance targets

Measured on agreed reference Android hardware:

- Local validation and transaction: target `p95 <= 250 ms` after the NFC callback begins.
- UI feedback: target visible/audible within `500 ms`.
- One hundred valid unique-card taps: zero accepted-event loss.
- Holding the same card in the NFC field: one event and one SMS outbox item.
- A different card can be accepted immediately after the prior card leaves the NFC field.
- Firebase and SMS outages do not change local scan acceptance time.

---

## 8. NFC Card Design

### 8.1 Card payload

The card must contain no student name, parent name, phone number, address, class, or other personally identifiable information.

Recommended compact payload:

```text
EDU1|<schoolPublicCode>|<randomToken>
```

Example:

```text
EDU1|AB12CD34|fW4Z_Qe8TVw3afW0Y5T8PQ
```

Fields:

- `EDU1`: payload/version marker
- `schoolPublicCode`: non-secret school routing code
- `randomToken`: at least 128 bits generated by a cryptographically secure random generator

The application computes:

```text
tokenHash = SHA-256(randomToken)
```

Cloud and local lookup tables store the hash, not the clear token. The clear token exists on the NFC card and only temporarily during issuance.

### 8.2 Recommended tag profile

Initial supported cards:

- NDEF-compatible NFC Type 2 tags
- NTAG213, NTAG215, or NTAG216 PVC cards
- Rewritable cards for school reuse
- Sufficient capacity for the compact payload and NDEF overhead

Do not permanently make cards read-only in the first release because the school needs replacement, clearing, and reuse workflows.

### 8.3 Optional tag UID

Store a hash of the observed hardware tag UID as a secondary anti-copy signal:

```text
tagUidHash = SHA-256(tagUid + schoolSalt)
```

Behavior:

- Matching token and matching UID: normal.
- Matching token but different UID: mark `POSSIBLE_CLONE`, show warning, require configured policy.
- Do not treat UID as cryptographic proof. Basic cards can still be copied or emulated.

### 8.4 Security tiers

**Standard tier — first release**

- Random token
- Token hash lookup
- Optional UID consistency
- Student photo displayed to teacher
- Lost/replaced card revocation
- Audit log

**Higher-security future tier**

- Cryptographic NFC products such as secure dynamic-authentication tags
- Managed keys
- Challenge/response validation
- Higher card cost and more complex issuance

The code must abstract card decoding behind a `CardProfile` interface so secure tags can be introduced later.

---

## 9. NFC Card State Machine

```text
AVAILABLE
   ↓ reserve for student
RESERVED
   ↓ writer waiting
WRITE_PENDING
   ↓ successful write + read-back verification
ACTIVE
   ├── LOST
   ├── DISABLED
   ├── REPLACED
   ├── DAMAGED
   └── RETIRED

WRITE_PENDING
   └── WRITE_FAILED
```

### Required transition rules

- Only `AVAILABLE` cards can be assigned normally.
- A token reservation expires if writing is never completed.
- A card is not `ACTIVE` until read-back verification succeeds.
- Replacement atomically marks the old card `REPLACED` when the new card activates.
- Lost or disabled cards never create attendance or SMS.
- Clearing a card requires privileged confirmation.
- Reusing a card always creates a new random token.
- Historical attendance keeps the original card reference even after replacement.
- Every state change creates an audit record.

---

## 10. NFC Writer Workflow

Card issuance should require an online connection because token reservation and activation must be globally unique and auditable.

```text
Select student
   ↓
Check user has nfc.write
   ↓
Call issueCardToken Cloud Function
   ↓
Receive one-time token reservation
   ↓
Enter dedicated WRITE MODE
   ↓
Teacher taps blank/reusable card
   ↓
Inspect tag technology, format, capacity, and writability
   ↓
Reject active/foreign/read-only card unless permitted
   ↓
Write NDEF payload
   ↓
Read the tag again
   ↓
Compare exact version, school code, and token
   ↓
Call activateCard Cloud Function
   ↓
Update local card snapshot
   ↓
Show CARD ACTIVATED
```

### Failure behavior

| Failure | Required behavior |
|---|---|
| Card removed during write | Mark attempt failed; do not activate |
| Unsupported tag | Show supported-card guidance |
| Insufficient capacity | Refuse write |
| Read-only tag | Refuse rewrite; allow read/test only |
| Existing active school card | Require explicit replace/reassign workflow |
| Foreign payload | Do not overwrite without privileged confirmation |
| Write succeeds but cloud activation fails | Keep card in `WRITE_PENDING`; retry activation; attendance rejects it until active |
| App closes mid-process | Reservation can be resumed or expires safely |
| Verification mismatch | Do not activate; offer rewrite |

Attendance mode must never write to a tag.

---

## 11. Attendance Model

### 11.1 Session modes

- `ARRIVAL`
- `DISMISSAL`
- `CUSTOM`

Do not infer alternating IN/OUT from repeated card taps. The teacher explicitly selects the session type, which prevents accidental sequences such as `IN → OUT → IN`.

### 11.2 Attendance idempotency key

For one-arrival/one-dismissal policy:

```text
schoolId | studentId | localSchoolDate | eventType
```

Example:

```text
SCH001|STU0152|2026-09-18|ARRIVAL
```

Store the hashed idempotency key and make it unique locally and in cloud ingestion.

### 11.3 Duplicate layers

1. **Radio/event debounce**
   - Default 3 seconds per card token.
   - Stops repeat callbacks while a card remains near the phone.

2. **Business idempotency**
   - Stops a second Arrival for the same student/date even after the debounce expires.
   - Stops duplicate SMS creation.

3. **Cloud idempotency**
   - Stops two authorized devices from creating two canonical Arrival events for the same student/date.

### 11.4 Attendance statuses

- `PRESENT`
- `LATE`
- `DISMISSED`
- `ABSENT`
- `EXCUSED`
- `CORRECTED`
- `VOIDED`

Raw events remain append-only. Corrections create a correction record and update the daily projection; they do not silently rewrite history.

### 11.5 Time integrity

Store:

- Device wall-clock time
- Device time zone
- Device monotonic elapsed time
- Last known server-time offset
- Cloud received time
- Clock trust state

If the device clock differs materially from the last trusted server offset:

- Continue local capture only if school policy permits.
- Mark events `CLOCK_UNTRUSTED`.
- Require reconciliation.
- Use cloud received time as additional evidence, not as a replacement for the original local event time.

---

## 12. Local Room Database

### 12.1 Tables

```text
local_school
local_device_authorization
local_users
local_students
local_guardians
local_student_guardian_links
local_enrollments
local_cards
local_sms_templates
scanner_sessions
attendance_events
attendance_corrections
sms_outbox
sync_outbox
sync_checkpoints
audit_outbox
app_settings
```

### 12.2 Important indexes

- `local_cards.token_hash` unique
- `local_cards.tag_uid_hash`
- `attendance_events.event_uuid` unique
- `attendance_events.idempotency_key` unique
- `sms_outbox.message_id` unique
- `sms_outbox.idempotency_key` unique
- `sync_outbox.aggregate_id`
- `local_students.student_number`
- `local_enrollments.section_id`

### 12.3 Local attendance event fields

```text
event_uuid
idempotency_key
school_id
student_id
card_id
event_type
local_school_date
local_timestamp
elapsed_realtime
timezone
clock_trust
device_id
teacher_id
scanner_session_id
source
status
sync_status
server_event_id
created_at
updated_at
```

### 12.4 Local SMS outbox fields

```text
message_id
attendance_event_uuid
guardian_id
phone_e164
template_id
rendered_message
subscription_id
status
attempt_count
next_attempt_at
sent_at
delivered_at
last_error_code
last_error_message
idempotency_key
created_at
updated_at
```

### 12.5 Local data protection

- Cache only data required for scanner operation.
- Keep full guardian numbers hidden in the UI for ordinary teachers.
- Protect sensitive local keys using Android Keystore.
- Use an encrypted Room-compatible storage strategy selected and security-reviewed during implementation.
- Wipe protected local data on device revocation after the app reconnects.
- Set an offline authorization lease so a device cannot operate forever without server contact.
- Optionally block screenshots on sensitive mobile screens.
- Require device screen lock for production enrollment.

---

## 13. SMS Engine

### 13.1 Sending architecture

Use two cooperating mechanisms:

1. **Immediate queue processor**
   - Runs while the scanner application/session is active.
   - Sends queued messages sequentially or with tightly controlled concurrency.
   - Does not run on the NFC callback thread.

2. **WorkManager recovery**
   - Resumes pending/retryable work after process death, reboot, connectivity changes, or temporary carrier failure.
   - Reconciles items left in `SENDING`.

```text
sms_outbox
   ↓
claim one eligible item
   ↓
SENDING
   ↓
SmsManager for selected subscription
   ├── sent callback
   └── delivery callback, when available
```

### 13.2 SMS states

```text
PENDING
READY
SENDING
SENT
DELIVERED
FAILED_RETRYABLE
FAILED_FINAL
CANCELLED
```

### 13.3 SIM handling

- Discover active subscriptions with authorized Android APIs.
- Display readable SIM label and carrier where available.
- Require the school to choose a designated SIM.
- Save the chosen subscription ID per device.
- Use subscription-specific `SmsManager`.
- Block automated sending if the selected SIM disappears until an authorized user selects another SIM.
- Provide a test-message screen.
- Display a clear warning if the device has no usable SMS subscription.

### 13.4 Retry policy

Classify failures:

**Retryable**

- Temporary radio unavailable
- No service
- Network congestion
- Device temporarily busy
- Process interrupted before confirmed result

**Final or administrative**

- Invalid destination
- Permission revoked
- No valid subscription
- Carrier rejection that will not improve through immediate retries
- School/message sending disabled
- Guardian notification disabled

Use exponential backoff with an upper limit and administrative visibility. Never create a new message record for a retry; retry the same idempotent outbox item.

### 13.5 Message generation

Example Arrival template:

```text
{{schoolName}}: {{studentName}} arrived at {{eventTime}} on {{eventDate}}.
Ref: {{shortReference}}
```

Validation:

- Required placeholder names must exist.
- Unknown placeholders are rejected.
- Preview the rendered message.
- Show estimated SMS segment count.
- Avoid unnecessary sensitive data.
- Do not expose the parent number on the NFC card.
- Retain the exact rendered text in the SMS log for auditing.

### 13.6 Parent number rules

Accept common Philippine input formats:

```text
09171234567
9171234567
+639171234567
```

Normalize to:

```text
+639171234567
```

Reject obviously malformed numbers and allow an authorized registrar to mark an exceptional international number explicitly.

### 13.7 Carrier and distribution limitation

The application will initially be distributed privately or through managed enterprise/school distribution because automated direct SMS uses sensitive Android permissions. The school must separately verify that its carrier plan permits the expected automated/bulk attendance traffic. "Unlimited text" does not automatically guarantee that automated high-volume messaging is allowed under every carrier's fair-use terms.

---

## 14. Offline-First Synchronization

### 14.1 Local-first rule

Attendance acceptance depends on:

- Valid local device authorization lease
- Active local card mapping
- Valid scanner session
- Local Room transaction success

It does not depend on live Firebase availability.

### 14.2 Device snapshot

An approved device downloads a scoped snapshot containing only what it needs:

- School public configuration
- Assigned sections/scope
- Active students
- Small student display photos or thumbnails
- Active/disabled card hashes
- Guardian SMS destinations and preferences
- Active SMS templates
- Attendance rules
- Device authorization lease
- Sync version/checkpoint

### 14.3 Sync outbox

Each local mutation creates a durable outbox item:

```text
ATTENDANCE_EVENT
SMS_STATUS
DEVICE_HEARTBEAT
CARD_WARNING
LOCAL_AUDIT
```

The sync worker uploads batches, receives per-item results, and marks each item independently.

### 14.4 Cloud ingestion result types

- `ACCEPTED`
- `ALREADY_EXISTS`
- `CONFLICT`
- `DEVICE_REVOKED`
- `USER_DISABLED`
- `LEASE_EXPIRED`
- `CARD_DISABLED`
- `INVALID_SCHEMA`
- `OUT_OF_SCOPE`

Local data is never deleted merely because cloud ingestion failed. Conflicts move to a reconciliation queue.

### 14.5 Revocation while offline

A fully offline device cannot instantly learn that it was revoked. Mitigate this with:

- Short, signed/validated authorization lease, such as 24 hours by default
- Required periodic online renewal
- Local display of lease expiration
- Block new scanner sessions after lease expiry
- Optional shorter lease for high-risk deployments
- Audit of scans made close to expiration

---

## 15. Firebase Data Model

Use a school-rooted multi-tenant structure.

```text
users/{uid}

schools/{schoolId}
schools/{schoolId}/members/{uid}
schools/{schoolId}/academicYears/{academicYearId}
schools/{schoolId}/gradeLevels/{gradeLevelId}
schools/{schoolId}/sections/{sectionId}
schools/{schoolId}/students/{studentId}
schools/{schoolId}/guardians/{guardianId}
schools/{schoolId}/studentGuardianLinks/{linkId}
schools/{schoolId}/enrollments/{enrollmentId}
schools/{schoolId}/nfcCards/{cardId}
schools/{schoolId}/cardReservations/{reservationId}
schools/{schoolId}/devices/{deviceId}
schools/{schoolId}/deviceLeases/{leaseId}
schools/{schoolId}/scannerSessions/{sessionId}
schools/{schoolId}/attendanceEvents/{eventId}
schools/{schoolId}/attendanceDays/{attendanceDayId}
schools/{schoolId}/attendanceCorrections/{correctionId}
schools/{schoolId}/smsTemplates/{templateId}
schools/{schoolId}/smsMessages/{messageId}
schools/{schoolId}/syncBatches/{batchId}
schools/{schoolId}/auditLogs/{auditId}
schools/{schoolId}/settings/{settingId}
```

### 15.1 User document

```text
displayName
email
platformStatus
lastLoginAt
createdAt
updatedAt
```

School-specific role and permissions belong in the membership document, not solely in the global user document.

### 15.2 Student document

```text
studentNumber
firstName
middleName
lastName
suffix
displayName
photoPath
status
currentEnrollmentId
activeCardId
createdAt
createdBy
updatedAt
updatedBy
```

### 15.3 Guardian document

```text
displayName
phoneE164
phoneMasked
phoneStatus
consentStatus
consentRecordedAt
status
createdAt
createdBy
updatedAt
updatedBy
```

### 15.4 Card document

```text
cardPublicId
studentId
tokenHash
tagUidHash
payloadVersion
tagTechnologies
status
issuedAt
issuedBy
issuedDeviceId
activatedAt
replacedCardId
replacementCardId
lastUsedAt
createdAt
updatedAt
```

Never store the clear random token after activation.

### 15.5 Device document

```text
devicePublicId
displayName
platform
appVersion
androidVersion
manufacturer
model
status
approvedBy
approvedAt
lastSeenAt
selectedSubscriptionFingerprint
allowedSectionIds
capabilities
leasePolicy
createdAt
updatedAt
```

### 15.6 Attendance event document

```text
eventId
idempotencyKey
studentId
cardId
eventType
localSchoolDate
localTimestamp
cloudReceivedAt
timezone
clockTrust
deviceId
teacherId
scannerSessionId
source
status
smsExpectedCount
createdAt
```

### 15.7 SMS message document

```text
messageId
idempotencyKey
attendanceEventId
studentId
guardianId
phoneMasked
templateId
renderedMessage
deviceId
subscriptionFingerprint
status
attemptCount
sentAt
deliveredAt
lastErrorCode
createdAt
updatedAt
```

Do not expose full destination numbers to roles that do not require them.

---

## 16. Cloud Function Boundary

Sensitive operations must go through authenticated Cloud Functions rather than unrestricted direct client writes.

### 16.1 Callable/HTTPS functions

```text
createSchool
inviteSchoolMember
updateMemberPermissions
registerDevice
approveDevice
renewDeviceLease
suspendDevice
revokeDevice

issueCardToken
activateCard
replaceCard
disableCard
reactivateCard
retireCard

getDeviceSnapshot
getDeviceSnapshotDelta
ingestAttendanceBatch
ingestSmsResultBatch
ingestDeviceHeartbeat

correctAttendance
voidAttendanceEvent

importStudents
generateAttendanceExport
```

### 16.2 Example card issuance contract

```text
issueCardToken request
{
  schoolId,
  studentId,
  operation: "NEW" | "REPLACE",
  replacedCardId?
}

response
{
  reservationId,
  cardPublicId,
  payloadVersion,
  schoolPublicCode,
  clearToken,
  expiresAt
}
```

The clear token is returned only to the authorized writer process. The server stores its hash.

### 16.3 Attendance batch contract

```text
ingestAttendanceBatch request
{
  deviceId,
  leaseId,
  batchId,
  events: [...]
}

response
{
  batchId,
  results: [
    {
      localEventUuid,
      result,
      serverEventId?,
      conflictReason?
    }
  ]
}
```

### 16.4 Function requirements

- Validate every request schema.
- Authenticate the caller.
- Verify school membership and granular permission.
- Verify approved device and active lease.
- Enforce tenant boundaries.
- Enforce idempotency.
- Use Firestore transactions where state transitions must be atomic.
- Create an audit record.
- Return machine-readable error codes.
- Never trust role, school ID, or device ID merely because the client supplied it.
- Make event-triggered functions idempotent because delivery can occur more than once.

---

## 17. Firebase Security Design

### 17.1 Rules posture

- Default deny.
- Authentication required.
- School membership required.
- Resource school must match membership school.
- Role/permission and resource scope required.
- Sensitive state transitions denied to direct client writes.
- Audit logs client-read only for authorized users and client-write denied.
- Card token hash fields inaccessible to ordinary teacher web sessions.
- Guardians and phone numbers restricted by least privilege.
- Cross-school collection access denied.
- Query constraints mirrored in rules.

### 17.2 Firebase Authentication

Initial supported method:

- Email/password for staff
- Password reset
- Email verification where appropriate

Optional later:

- Google Workspace
- SAML/OIDC
- Admin MFA

### 17.3 App Check

- Admin web: supported web App Check provider.
- Android: use Play Integrity when compatible with the chosen managed distribution.
- If private sideloading cannot satisfy production attestation requirements, implement a custom App Check/device-attestation design rather than leaving enforcement disabled.
- Debug providers are development-only.

### 17.4 Secrets

- Firebase web configuration is not treated as a server secret.
- Service-account credentials never enter React or APK source.
- Function secrets use Google Secret Manager.
- Android signing keys are stored securely outside source control.
- Token-generation secrets and salts remain server-side.

### 17.5 Security Rules testing

Automated tests must prove:

- Unauthenticated access is denied.
- Cross-school reads and writes are denied.
- Teacher cannot manage users.
- Teacher cannot activate or replace cards without permission.
- Teacher cannot read unrelated sections.
- Client cannot create audit records directly.
- Disabled member is denied.
- Revoked device cannot renew or ingest.
- Admin can perform only authorized school-scoped operations.
- Export endpoints verify authorization.

---

## 18. Privacy and Student Data Protection

The application processes student identity, education/attendance data, guardian contact data, and potentially student photographs. The school must complete its own privacy and legal review before production.

Required product controls:

- Privacy notice before guardian data collection
- Recorded lawful basis/consent status as required by school policy
- Purpose limitation
- Data minimization
- No phone number or name on NFC card
- Role-based access
- Masked phone display
- Configurable retention schedule
- Access/correction/export workflow
- Deletion or anonymization workflow subject to school record obligations
- Audit trail
- Incident-response process
- Data Processing Agreement review for cloud services
- Documented backup and breach-response procedures
- Privacy Impact Assessment before school-wide deployment
- Named school data protection/contact person
- Training for teachers and registrars

The Philippine Data Privacy Act treats education information as sensitive personal information and requires lawful, proportionate processing and reasonable organizational, physical, and technical safeguards. The project must be reviewed by the school's authorized privacy/legal personnel before launch.

---

## 19. React User Experience

### 19.1 Mobile scanner screen

```text
┌────────────────────────────────┐
│ SCHOOL NAME       Online/Offline│
│ Grade 8 - A       Arrival       │
│                                │
│          ((( NFC )))           │
│                                │
│        READY TO SCAN           │
│                                │
├────────────────────────────────┤
│ Latest                         │
│ ✓ Juan Santos       7:42:03    │
│ ✓ Maria Cruz        7:42:01    │
│ ⚠ Card disabled     7:41:58    │
├────────────────────────────────┤
│ Accepted 38  SMS 36/38         │
│ Sync queue 2   SMS queue 2     │
└────────────────────────────────┘
```

Requirements:

- No modal after valid scan
- Large high-contrast status
- Student photo and name
- Green accepted, amber duplicate/warning, red rejected
- Sound plus vibration with configurable accessibility alternatives
- Always-visible mode, device, SIM, sync, and lease state
- Recent scans can update without remounting NFC reader
- Light and dark modes
- Usable on entry-level phones
- No heavy image loading while scanning

### 19.2 Mobile Card Manager

Screens:

- Card inventory
- Read/test card
- Assign new card
- Replace lost card
- Disable/reactivate
- Clear/reuse
- Write progress
- Verification result
- Card history

Writer screen must show:

```text
Selected student
Operation
Tag status
Write status
Read-back status
Cloud activation status
```

### 19.3 Admin portal

Responsive navigation:

- Dashboard
- Students
- Guardians
- Classes
- Users
- Devices
- NFC Cards
- Attendance
- SMS
- Reports
- Audit
- Settings

Requirements:

- Desktop data tables
- Tablet responsive panels
- Mobile card/list views
- Keyboard accessibility
- Loading, empty, error, and offline states
- Confirmation dialogs for destructive actions
- Optimistic UI only where rollback is safe
- Server-side pagination/filtering for large datasets

---

## 20. Validation Strategy

Every important input is validated at multiple boundaries.

```text
React form
   ↓
Shared Zod schema
   ↓
Cloud Function schema and authorization
   ↓
Firestore transaction
   ↓
Security Rules where client access exists
```

Native operations add another layer:

```text
NFC payload
   ↓
Native parser
   ↓
Payload version and length validation
   ↓
Token hashing and local lookup
   ↓
Domain rule validation
```

### Required validation examples

- Student number uniqueness per school
- Required name fields
- Valid enrollment and section
- Guardian number normalization
- SMS placeholder allow-list
- NFC payload version and maximum size
- Card reservation expiration
- Card state transition
- Device authorization lease
- Scanner mode
- Attendance state transition
- Event date/time sanity
- Idempotency key
- Import file schema and row-level errors
- Report date range
- Correction reason minimum length
- File type and image size

Never rely only on HTML `required`, React state, or Firestore Rules.

---

## 21. Clean Monorepo Structure

```text
nfc-school-attendance/
│
├── apps/
│   ├── admin-web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── routes/
│   │   │   ├── layouts/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── schools/
│   │   │   │   ├── users/
│   │   │   │   ├── students/
│   │   │   │   ├── guardians/
│   │   │   │   ├── academics/
│   │   │   │   ├── devices/
│   │   │   │   ├── nfc-cards/
│   │   │   │   ├── attendance/
│   │   │   │   ├── sms/
│   │   │   │   ├── reports/
│   │   │   │   ├── audit/
│   │   │   │   └── settings/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   ├── stores/
│   │   │   ├── validation/
│   │   │   └── test/
│   │   └── vite.config.ts
│   │
│   ├── teacher-mobile/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── routes/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── device-enrollment/
│   │   │   │   ├── scanner/
│   │   │   │   ├── attendance/
│   │   │   │   ├── card-manager/
│   │   │   │   ├── sms/
│   │   │   │   ├── sync/
│   │   │   │   └── settings/
│   │   │   ├── native/
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   └── test/
│   │   │
│   │   ├── android/
│   │   │   └── app/src/main/java/com/example/attendance/
│   │   │       ├── bridge/
│   │   │       ├── nfc/
│   │   │       │   ├── reader/
│   │   │       │   ├── writer/
│   │   │       │   ├── payload/
│   │   │       │   └── profiles/
│   │   │       ├── attendance/
│   │   │       ├── sms/
│   │   │       ├── sync/
│   │   │       ├── database/
│   │   │       │   ├── entities/
│   │   │       │   ├── dao/
│   │   │       │   ├── migrations/
│   │   │       │   └── transactions/
│   │   │       ├── device/
│   │   │       ├── security/
│   │   │       ├── workers/
│   │   │       ├── receivers/
│   │   │       └── diagnostics/
│   │   └── capacitor.config.ts
│   │
│   └── functions/
│       ├── src/
│       │   ├── auth/
│       │   ├── schools/
│       │   ├── users/
│       │   ├── devices/
│       │   ├── cards/
│       │   ├── attendance/
│       │   ├── sms/
│       │   ├── reports/
│       │   ├── audit/
│       │   ├── triggers/
│       │   └── shared/
│       └── test/
│
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── validation/
│   ├── firebase-client/
│   ├── ui/
│   ├── config/
│   ├── observability/
│   └── test-utils/
│
├── firebase/
│   ├── firebase.json
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── storage.rules
│   ├── seed/
│   └── emulator/
│
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── api/
│   ├── nfc/
│   ├── sms/
│   ├── privacy/
│   ├── deployment/
│   ├── operations/
│   └── testing/
│
├── scripts/
├── .github/workflows/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

### Folder rules

- Feature folders own UI, hooks, schema adapters, and tests for that feature.
- Shared packages contain truly reusable contracts or components only.
- Native Kotlin owns time-critical NFC, local persistence, SMS, and recovery.
- React never contains service-account credentials.
- Firebase Functions never import browser-only code.
- Domain state machines have unit tests independent of UI.

---

## 22. Native-to-React Bridge Contract

Expose narrow, typed Capacitor plugins rather than arbitrary native calls.

### 22.1 Attendance plugin

```text
getCapabilities()
getDeviceState()
startScannerSession(config)
stopScannerSession()
getScannerSessionState()
getRecentScans()
```

Events:

```text
scannerReady
scanAccepted
scanRejected
scanDuplicate
scannerError
queueStateChanged
deviceLeaseChanged
```

### 22.2 NFC Card plugin

```text
readCard()
beginWriteCard(writeRequest)
cancelWrite()
clearCard()
getWriteState()
```

Events:

```text
tagDetected
writeProgress
writeVerified
writeFailed
```

### 22.3 SMS plugin

```text
requestSmsPermission()
listSubscriptions()
selectSubscription(subscriptionId)
sendTestSms(phone, message)
getQueueSummary()
retryMessage(messageId)
```

### 22.4 Bridge principles

- Version every payload.
- Validate both native and TypeScript representations.
- Never pass raw Room entities directly to React.
- Return stable machine-readable error codes.
- Avoid transferring full guardian datasets through the bridge.
- Emit only UI-relevant scan results.

---

## 23. Audit Log Requirements

Audit events include:

```text
USER_INVITED
USER_DISABLED
ROLE_CHANGED

DEVICE_REGISTERED
DEVICE_APPROVED
DEVICE_SUSPENDED
DEVICE_REVOKED

STUDENT_CREATED
STUDENT_UPDATED
STUDENT_ARCHIVED

GUARDIAN_CREATED
GUARDIAN_PHONE_UPDATED
GUARDIAN_CONSENT_UPDATED

CARD_RESERVED
CARD_WRITTEN
CARD_ACTIVATED
CARD_REPLACED
CARD_LOST
CARD_DISABLED
CARD_REACTIVATED
CARD_CLEARED
CARD_RETIRED
CARD_CLONE_WARNING

SCANNER_SESSION_STARTED
SCANNER_SESSION_STOPPED

ATTENDANCE_ACCEPTED
ATTENDANCE_CONFLICT
ATTENDANCE_CORRECTED
ATTENDANCE_VOIDED

SMS_QUEUED
SMS_SENT
SMS_DELIVERED
SMS_FAILED
SMS_RETRIED
SMS_CANCELLED

SETTINGS_CHANGED
EXPORT_GENERATED
```

Each audit event stores:

- School
- Event type
- Actor user
- Actor device where relevant
- Target entity
- Timestamp
- Before/after summary where permitted
- Reason
- Request/correlation ID
- Source IP/server context when available

Audit records are append-only from client perspective.

---

## 24. Reports

First production report set:

- Daily attendance
- Attendance by date range
- Attendance by class/section
- Student attendance history
- Late arrivals
- Missing arrivals
- Dismissal records
- Manual corrections
- Unknown/disabled card attempts
- Card inventory and assignment
- Lost/replaced cards
- Device activity
- SMS sent
- SMS delivered where available
- SMS pending
- SMS failed
- Guardian number issues
- Audit activity

Filters:

- School date range
- Academic year
- Grade
- Section
- Student
- Event type
- Attendance status
- Device
- Teacher
- SMS status

Exports must record who generated the export and its filter criteria.

---

## 25. Loopholes and Required Mitigations

| Risk | Mitigation |
|---|---|
| Student gives card to another student | Display student photo/name; teacher-supervised scanning |
| Basic card is cloned | Random token, optional UID mismatch warning, lost/replaced revocation, secure-tag upgrade path |
| Same card held near phone | Per-card debounce |
| Same card tapped again later | Attendance idempotency |
| Two devices scan same student | Cloud idempotency and reconciliation |
| Arrival scan followed by student leaving | Controlled Dismissal process; system is attendance evidence, not continuous presence proof |
| Parent number stored on card | Never store PII on NFC |
| Wrong parent number | Registrar verification status and correction workflow |
| SMS is sent twice | SMS idempotency key and unique local constraint |
| SMS fails but attendance is lost | Attendance and SMS are separate durable records |
| App is killed | Room outboxes and WorkManager recovery |
| Phone restarts | Queue reconciliation on boot/app start |
| No internet | Local attendance and SMS continue; Firebase sync waits |
| No cellular signal | Attendance continues; SMS waits |
| Teacher changes phone time | Clock trust state, server offset, reconciliation |
| Lost card | Disable/replace immediately |
| Lost phone | Revoke device; short offline lease; local wipe after reconnect |
| Unauthorized NFC write | Separate writer mode and permission |
| Active card overwritten | Inspect and block unless privileged workflow |
| Carrier blocks high-volume messages | Rate safeguards, queue visibility, carrier-plan review |
| Sensitive data exposed on teacher screen | Masking, role scope, short display, screenshot protection option |
| Revoked offline device continues | Expiring authorization lease |
| React UI freezes | Native scanner path operates independently |
| Firebase trigger repeats | Idempotent Functions and unique event keys |

---

## 26. Testing Strategy

### 26.1 TypeScript unit tests

- Student/guardian schemas
- Phone normalization
- SMS template rendering
- Placeholder validation
- Card state machine
- Attendance state machine
- Permission checks
- Import validation
- Idempotency-key generation
- Cloud function request validation

### 26.2 Firebase Emulator tests

- Authentication flows
- Every Security Rules permission boundary
- Cross-school denial
- Card reservation transaction
- Card replacement transaction
- Attendance batch idempotency
- Duplicate event ingestion
- Correction audit creation
- SMS result ingestion
- Revoked-device rejection
- Expired-lease rejection

### 26.3 Android unit/integration tests

- Payload parser
- Token hashing
- Room migrations
- Atomic scan transaction
- Per-card debounce
- Persisted idempotency
- SMS outbox claiming
- Retry classification
- WorkManager recovery
- SIM selection state
- Revocation/lease state
- Clock trust logic

### 26.4 Physical device tests

Use at least:

- One entry-level Android phone
- One mid-range Android phone
- One dual-SIM phone
- Different Android versions within supported range
- NTAG213 and NTAG215 cards
- Cards that are blank, formatted, unsupported, read-only, damaged, and already assigned

Test scenarios:

1. 100 unique cards consecutively
2. Same card held against phone
3. Alternating two cards quickly
4. 50 scans with no internet
5. 50 scans with no SMS signal
6. Internet restored
7. SMS signal restored
8. App force-stopped after queue creation
9. Phone rebooted with pending messages
10. Selected SIM removed
11. SMS permission revoked
12. NFC disabled mid-session
13. Card removed during write
14. Write succeeds but activation request fails
15. Lost card scanned
16. Replaced card scanned
17. Cloned token on different UID
18. Two devices scan same student
19. Device revoked while online
20. Device offline lease expires
21. Phone time changed
22. Firebase Functions unavailable
23. Invalid guardian number
24. SMS multipart message
25. Large student master-data snapshot

### 26.5 End-to-end tests

- Admin creates school data
- Registrar enrolls student and guardian
- Registrar writes and verifies card
- Teacher downloads device snapshot
- Student card creates Arrival
- SMS queue transmits
- Cloud receives attendance and SMS status
- Admin report shows the event
- Admin replaces card
- Old card is rejected
- Manual correction creates immutable audit history

### 26.6 Security tests

- Cross-tenant access
- Modified request payload
- Forged role field
- Replayed batch
- Replayed card activation
- Expired reservation
- Direct audit write
- Unauthorized export
- Revoked user
- Revoked device
- Malformed NFC payload
- Oversized NDEF payload
- Log redaction
- Secrets scan of repository and APK configuration

---

## 27. CI/CD and Environment Strategy

### 27.1 Environments

Use separate Firebase projects:

```text
development
staging
production
```

Never use production student information in development.

### 27.2 Pull-request pipeline

Every pull request runs:

- Dependency install with frozen lockfile
- Formatting check
- ESLint
- TypeScript type check
- Unit tests
- Web build
- Functions build
- Firebase Rules tests
- Emulator integration tests
- Android unit tests
- Debug APK build
- Secret scanning
- Dependency vulnerability scan

### 27.3 Release pipeline

Staging:

- Deploy Hosting
- Deploy Functions
- Deploy Rules and indexes
- Build signed staging APK
- Run smoke tests

Production:

- Manual approval
- Database/index migration check
- Rules deployment
- Function deployment
- Hosting deployment
- Signed production APK or managed private release
- Release notes
- Post-deploy health checks
- Rollback instructions

### 27.4 Android signing

- Production signing key is never committed.
- Maintain secure offline backup.
- Restrict signing access.
- Record certificate fingerprints in Firebase.
- Use different keys/app IDs for development, staging, and production where appropriate.

---

## 28. Monitoring and Operations

### 28.1 Mobile metrics

- Scan processing latency
- Scan rejection reasons
- Pending SMS count
- Oldest pending SMS age
- SMS failure categories
- Pending sync count
- Oldest pending sync age
- Local database errors
- NFC write failures
- App crashes
- Device lease expiry
- App version adoption

### 28.2 Cloud metrics

- Attendance batch success/failure
- Duplicate/conflict rate
- Function error rate and latency
- Firestore usage
- App Check rejection
- Device heartbeat health
- Card activation failures
- Export volume
- Cross-tenant authorization denials

### 28.3 Admin alerts

- Device offline beyond threshold
- Device lease near expiry
- SMS queue backlog
- High SMS failure rate
- Sync backlog
- Repeated unknown cards
- Possible cloned card
- Expired card reservations
- Old app version
- Disabled user/device activity attempt

### 28.4 Operational runbooks

Create documented procedures for:

- Registering a device
- Approving a device
- Selecting/testing SIM
- Writing a card
- Replacing a lost card
- Clearing a reusable card
- Troubleshooting NFC
- Troubleshooting SMS
- Resolving duplicate conflicts
- Reconciling offline data
- Revoking a lost phone
- Restoring from backup
- Responding to a suspected breach
- Handling a privacy access/correction request

---

## 29. Implementation Phases

Tasks are sequential unless explicitly marked parallel. A phase is complete only when its exit criteria pass.

### Phase 0 — Product and security decisions

- [ ] Confirm Android-only scanner scope.
- [ ] Confirm private APK, managed Play, or MDM distribution.
- [ ] Select reference teacher phones.
- [ ] Select NFC card model.
- [ ] Confirm one-school or multi-school first launch.
- [ ] Confirm roles and permission defaults.
- [ ] Confirm attendance event types.
- [ ] Confirm guardian consent process.
- [ ] Confirm data retention policy.
- [ ] Confirm carrier/SIM operational policy.
- [ ] Complete initial privacy impact assessment.
- [ ] Record decisions as Architecture Decision Records.

**Exit criteria**

- Hardware, distribution, privacy owner, and school workflow are approved.
- No unresolved decision blocks NFC, SMS permissions, or data retention.

---

### Phase 1 — Repository and engineering foundation

- [ ] Create pnpm/Turborepo monorepo.
- [ ] Create admin web, teacher mobile, and Functions applications.
- [ ] Create shared contracts, validation, UI, and config packages.
- [ ] Configure TypeScript strict mode.
- [ ] Configure linting and formatting.
- [ ] Configure environment validation.
- [ ] Add development/staging/production Firebase aliases.
- [ ] Add base CI pipeline.
- [ ] Add coding standards and contribution guide.
- [ ] Add dependency-update workflow.

**Exit criteria**

- All applications build in CI.
- No secrets are stored in source.
- Environment configuration fails fast when invalid.

---

### Phase 2 — Firebase foundation

- [ ] Provision three Firebase projects.
- [ ] Configure Authentication.
- [ ] Create Firestore database and initial indexes.
- [ ] Configure Storage.
- [ ] Configure Hosting.
- [ ] Configure Functions runtime.
- [ ] Configure Emulator Suite.
- [ ] Write default-deny Security Rules.
- [ ] Add Rules test harness.
- [ ] Configure logging, budget alerts, and monitoring.
- [ ] Design App Check approach for chosen distribution.

**Exit criteria**

- Emulator tests pass.
- Unauthenticated access is denied.
- Staging Hosting and Functions deploy successfully.

---

### Phase 3 — Authentication, membership, RBAC, and devices

- [ ] Implement login/logout/reset.
- [ ] Implement school memberships.
- [ ] Implement permission resolver.
- [ ] Implement user invitation and disable flow.
- [ ] Implement device registration.
- [ ] Implement admin approval.
- [ ] Implement device lease issuance/renewal.
- [ ] Implement suspension and revocation.
- [ ] Implement mobile device-enrollment screen.
- [ ] Implement user/device audit events.

**Exit criteria**

- An unapproved phone cannot download scanner data or start a session.
- A revoked device is rejected online.
- Cross-school access tests pass.
- Permission changes are audited.

---

### Phase 4 — Academic, student, and guardian master data

- [ ] Implement academic years, grades, and sections.
- [ ] Implement student CRUD.
- [ ] Implement guardian CRUD.
- [ ] Implement student-guardian links.
- [ ] Implement phone normalization.
- [ ] Implement consent/notification preferences.
- [ ] Implement photo upload and thumbnail generation.
- [ ] Implement search/filter/pagination.
- [ ] Implement validated CSV import with preview.
- [ ] Implement archive/restore.
- [ ] Add complete Rules and function tests.

**Exit criteria**

- Registrar can enroll a student with a valid guardian.
- Invalid rows are reported without corrupting valid data.
- Teachers see only permitted students.

---

### Phase 5 — Native foundation and Room

- [ ] Add Capacitor Android project.
- [ ] Define typed bridge contracts.
- [ ] Create Room schema and migrations.
- [ ] Create repositories and transaction layer.
- [ ] Implement Android Keystore-backed local protection.
- [ ] Implement local snapshot storage.
- [ ] Implement authorization lease storage.
- [ ] Implement sync outbox.
- [ ] Implement app-start recovery.
- [ ] Add native diagnostics page.

**Exit criteria**

- App restarts without losing queues.
- Room migration tests pass.
- Native bridge schema mismatches fail safely.

---

### Phase 6 — NFC Card Manager

- [ ] Implement NFC capability detection.
- [ ] Implement dedicated reader/writer modes.
- [ ] Implement NDEF parser.
- [ ] Implement compact payload codec.
- [ ] Implement NDEF tag formatting.
- [ ] Implement writability and capacity checks.
- [ ] Implement secure token reservation.
- [ ] Implement write and read-back verification.
- [ ] Implement card activation.
- [ ] Implement read/test card.
- [ ] Implement replace/lost/disable/reactivate.
- [ ] Implement clear/reuse/retire.
- [ ] Implement overwrite prevention.
- [ ] Implement card history and audit.
- [ ] Test supported physical cards.

**Exit criteria**

- Card cannot become active without read-back verification.
- Removing a card during write does not activate it.
- Old card is rejected after replacement.
- Attendance mode never writes to a card.

---

### Phase 7 — Scanner and local attendance engine

- [ ] Implement native NFC reader session.
- [ ] Implement local card resolver.
- [ ] Implement scanner mode/session state.
- [ ] Implement per-card debounce.
- [ ] Implement attendance idempotency.
- [ ] Implement Arrival/Dismissal/Custom rules.
- [ ] Implement late calculation.
- [ ] Implement atomic attendance/SMS/sync transaction.
- [ ] Implement accepted/rejected result events.
- [ ] Implement sound/vibration.
- [ ] Implement recent-scan UI.
- [ ] Implement offline and lease indicators.
- [ ] Implement manual fallback with permission.
- [ ] Implement clock trust monitoring.

**Exit criteria**

- Rapid-scan physical test passes.
- No network or SMS call occurs in NFC callback.
- One accepted scan produces exactly one attendance event and expected SMS items.
- Repeated card produces no duplicate SMS.

---

### Phase 8 — SMS sender

- [ ] Implement permission flow.
- [ ] Implement subscription discovery.
- [ ] Implement designated SIM selection.
- [ ] Implement test SMS.
- [ ] Implement outbox processor.
- [ ] Implement multipart SMS.
- [ ] Implement sent receiver.
- [ ] Implement delivery receiver.
- [ ] Implement retry classification/backoff.
- [ ] Implement WorkManager recovery.
- [ ] Implement startup reconciliation for stale `SENDING`.
- [ ] Implement manual retry/cancel.
- [ ] Implement queue dashboard and safeguards.
- [ ] Implement redacted logs.

**Exit criteria**

- Scanner remains responsive while messages send.
- Pending messages survive process death and reboot.
- SIM removal is handled without losing attendance.
- Same outbox item is never sent concurrently twice.

---

### Phase 9 — Firebase synchronization and reconciliation

- [ ] Implement snapshot download.
- [ ] Implement delta sync.
- [ ] Implement attendance batch ingestion.
- [ ] Implement SMS result ingestion.
- [ ] Implement idempotent cloud event creation.
- [ ] Implement daily attendance projection.
- [ ] Implement conflict result processing.
- [ ] Implement device heartbeat.
- [ ] Implement retries and backoff.
- [ ] Implement reconciliation UI.
- [ ] Implement cloud-trigger idempotency tests.

**Exit criteria**

- Fifty offline scans synchronize correctly after reconnection.
- Two-device duplicate test creates one canonical event.
- Conflict is visible and does not erase local evidence.
- Repeated cloud function delivery does not duplicate output.

---

### Phase 10 — Admin dashboards and reports

- [ ] Build summary dashboard.
- [ ] Build live/recent attendance view.
- [ ] Build attendance search and detail.
- [ ] Build SMS queue/log views.
- [ ] Build NFC inventory views.
- [ ] Build device management.
- [ ] Build corrections workflow.
- [ ] Build report filters.
- [ ] Build CSV/Excel-compatible exports.
- [ ] Build audit log viewer.
- [ ] Optimize responsive layouts.
- [ ] Add accessibility review.

**Exit criteria**

- Admin can trace Card → Student → Attendance → SMS → Device → Audit.
- Corrections require reason and preserve before/after values.
- Portal is usable on desktop, tablet, and mobile.

---

### Phase 11 — Security and privacy hardening

- [ ] Complete threat model.
- [ ] Complete privacy impact assessment.
- [ ] Review all Firestore and Storage Rules.
- [ ] Enable/enforce App Check according to distribution strategy.
- [ ] Verify server secret management.
- [ ] Add log redaction.
- [ ] Add screenshot protection option.
- [ ] Add local data wipe after revocation.
- [ ] Add retention jobs.
- [ ] Add privacy export/correction process.
- [ ] Add incident-response documentation.
- [ ] Perform dependency and APK security review.

**Exit criteria**

- No high-severity unresolved finding.
- Privacy owner signs off.
- Cross-tenant and revoked-device tests pass.
- Sensitive data is absent from NFC payload and ordinary logs.

---

### Phase 12 — Pilot and production verification

- [ ] Seed a staging school.
- [ ] Train pilot teachers and registrar.
- [ ] Register pilot devices.
- [ ] Issue pilot cards.
- [ ] Run rapid arrival/dismissal trial.
- [ ] Run internet-outage trial.
- [ ] Run cellular-outage trial.
- [ ] Run reboot/recovery trial.
- [ ] Verify parent message wording.
- [ ] Record hardware-specific NFC tap placement.
- [ ] Fix pilot findings.
- [ ] Complete acceptance test report.

**Exit criteria**

- School signs off on workflow.
- Queue recovery is demonstrated.
- No accepted scan is lost.
- Parent contact/consent process is approved.
- Support runbooks are complete.

---

### Phase 13 — Production deployment

- [ ] Deploy production Firestore Rules, indexes, Functions, and Hosting.
- [ ] Create initial School Admin securely.
- [ ] Build signed production APK/private release.
- [ ] Enroll production devices.
- [ ] Import production students/guardians.
- [ ] Verify backup configuration.
- [ ] Verify monitoring and alerts.
- [ ] Conduct final smoke test.
- [ ] Publish user guides.
- [ ] Record release version and rollback point.

**Exit criteria**

- Production checklist signed.
- Monitoring is active.
- Backup/restore and device-revocation procedures are tested.
- School can operate without developer intervention for normal workflows.

---

## 30. Production Acceptance Criteria

The release is not production-ready until all are true:

### NFC

- [ ] Supported cards can be read, formatted, written, and verified.
- [ ] Card activation requires read-back verification.
- [ ] Active cards cannot be accidentally overwritten.
- [ ] Lost/replaced/disabled cards are rejected.
- [ ] No personal information is stored on the card.

### Scanning

- [ ] Scanner accepts consecutive different cards without waiting for SMS.
- [ ] Same-card hold creates one event.
- [ ] Business duplicate creates no second SMS.
- [ ] Offline scanning works with valid device lease.
- [ ] App restart preserves attendance and queues.

### SMS

- [ ] Designated SIM is used.
- [ ] Permission and missing-SIM states are clear.
- [ ] Pending SMS survives restart.
- [ ] Retry does not duplicate messages.
- [ ] Queue and failures are visible to authorized users.

### Firebase

- [ ] Cross-school access is denied.
- [ ] Sensitive transitions use trusted Functions.
- [ ] Batch ingestion is idempotent.
- [ ] Rules tests pass.
- [ ] App Check strategy is enforced.
- [ ] Audit records are append-only to clients.

### Privacy and operations

- [ ] Privacy notice and guardian process are approved.
- [ ] Retention policy is configured.
- [ ] Lost device can be revoked.
- [ ] Offline authorization expires.
- [ ] Backup and recovery are documented.
- [ ] Teachers and registrars are trained.

### User experience

- [ ] Mobile scanner works on agreed entry-level device.
- [ ] Admin portal is responsive.
- [ ] Light/dark and accessibility states are verified.
- [ ] Errors are understandable and actionable.
- [ ] No ordinary workflow requires NFC Tools or another external writer app.

---

## 31. Recommended Release Sequence

### Release 1 — Controlled school pilot

- One school
- Selected teachers
- Private Android APK
- Arrival and Dismissal
- Student/guardian management
- Card writing
- Offline Room storage
- SIM SMS
- Firebase synchronization
- Core reports and audit

### Release 2 — School-wide production

- All sections
- Multiple approved devices
- Full imports/exports
- Device monitoring
- Advanced reports
- Privacy workflows
- Operational support

### Release 3 — Expansion

- Multiple schools
- Secure cryptographic card profile
- Managed Google Play/MDM distribution
- Parent portal or app
- Cloud SMS fallback
- QR backup credential
- Dedicated NFC kiosk/gate hardware
- Integration with a broader student information or ERP platform

---

## 32. Final Architecture Rule

The complete product must preserve this separation:

```text
REACT
- Presents UI
- Collects authorized user intent
- Shows scanner/card/SMS/sync state

KOTLIN
- Controls NFC
- Writes and verifies cards
- Resolves scans locally
- Commits Room transactions
- Sends SIM SMS
- Recovers queues

FIREBASE
- Authenticates people
- Authorizes schools and devices
- Stores cloud records
- Resolves multi-device conflicts
- Serves administration and reports
- Maintains audit and configuration
```

The scanner must continue to work even when React is rendering, Firebase is slow, or the carrier is still sending the previous student's SMS.

That separation is the core requirement that makes the system fast, reliable, secure, and ready for real school use.
