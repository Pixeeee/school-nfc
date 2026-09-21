
# Operations Runbook

## Issue a card

1. Confirm the student and guardian record.
2. Open Card Manager on an approved, online device.
3. Select the student.
4. Choose New or Replace.
5. Keep the card against the phone through Writing, Verifying, and Activating.
6. Do not use the card if activation does not reach Succeeded.

## Lost card

Mark the card Lost or replace it. The old token is rejected immediately by online/cloud state and after the next snapshot on offline scanners.

## Lost phone

Revoke the phone in Admin → Devices, revoke the staff session if needed, and record the incident. The phone's offline lease eventually expires even if it does not reconnect.

## SMS backlog

1. Confirm selected SIM and SEND_SMS permission.
2. Confirm cellular service and carrier status.
3. Check retryable versus final failures.
4. Correct invalid guardian numbers in Admin.
5. Retry only retryable messages; never create duplicate attendance to trigger another message.

## Sync backlog

1. Confirm internet and unexpired device lease.
2. Select Synchronize now.
3. Review conflicts in Admin rather than deleting local evidence.
4. Verify phone clock and school time zone when `CLOCK_UNTRUSTED` appears.

## Card clone warning

Do not accept attendance automatically. Compare the student/photo, collect the card, disable the credential, issue a new random credential, and document the incident.
