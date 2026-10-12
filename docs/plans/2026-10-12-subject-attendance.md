# Subject attendance and adviser implementation

User approved: shared section roster, administrator assigns adviser and subject teachers; teacher can have both roles. Subjects have names and start/end schedule editable by assigned teacher. Students have parent numbers, no accounts. Three manual attendance choices Present on time, Present late, Absent. SMS includes student, subject, full local date, recorded time and schedule. Adviser sees attendance across subjects and has Out action with recipient count confirmation, sends dated/timed dismissal to all consenting active parents, prevents repeat same section/day. Existing sections/rosters/accounts must survive; creator defaults adviser until admin reassigns. No phone registration, no billing, prepaid SIM SMS stays native.

## Task 1: Implement subjects and adviser attendance

Implement coherent end-to-end existing Spark architecture, admin portal assignments/view and Android/native + React teacher flows, Firebase rules/indexes and focused tests. Existing teacherId can remain compatibility creator, adviserId authoritative fallback teacherId. Assigned subject teachers access shared roster and only own subject attendance; adviser edits roster, sees all subject attendance and Out. Validate permissions and fields server/rules/native, do not trust frontend. Preserve offline queued attendance and upgrade Room safely. Use smallest code consistent existing helpers. Explicit tags ON_TIME/LATE/ABSENT and per-subject day latest status; unmarked is not absent. Schedule suggest late, teacher explicitly chooses. Out single/day protected against duplicate taps and devices, recoverable queue, count consent contacts. No physical SMS test to real parents. Do not alter/delete real school data. Cover invariants tests and existing regressions. Do not deploy/push/build APK or change version/build.gradle/manifest/feedback crash code: controller owns those. Teacher UI native interface must coordinate with native implementation. No subagents. Report touched files, test commands/results, concerns, and data migration/compatibility decisions to work/subject-implementation-report.md (workspace parent work). Do not commit until controller requests.

## Task 2: Fix crash and reduce APK

Controller diagnoses onScan feedback missing VIBRATE permission, adds permission plus nonfatal feedback safeguards and verifies activity path. Enable release R8/resource shrinking and appropriate rules, remove source maps from bundled assets. Preserve signing identity and application id; bump to 1.3.0/versionCode4. Test release and package metadata/size.

## Task 3: Review, verify and publish

Review entire diff against above requirements. Run rules/admin/mobile/native meaningful tests; live disposable data only with cleanup. Push main, deploy Spark rules/indexes and Vercel production and publish signed APK EAS preview free plan. Confirm deployed download and signature/size. Report physical new feature limitations candidly.
