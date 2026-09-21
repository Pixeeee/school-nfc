#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="$ROOT/reports/release-verification"
LOG_DIR="$REPORT_DIR/logs"
REPORT="$REPORT_DIR/REPORT.md"
RESULTS="$REPORT_DIR/results.tsv"
mkdir -p "$LOG_DIR"
: > "$RESULTS"

run_check() {
  local id="$1"
  local title="$2"
  local required="$3"
  shift 3
  local log="$LOG_DIR/$id.log"
  local started ended seconds status
  started=$(date +%s)
  set +e
  (cd "$ROOT" && "$@") >"$log" 2>&1
  status=$?
  set -e
  ended=$(date +%s)
  seconds=$((ended-started))
  printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$title" "$required" "$status" "$seconds" >> "$RESULTS"
  return 0
}

skip_check() {
  local id="$1" title="$2" required="$3" reason="$4"
  printf '%s\t%s\t%s\tSKIPPED\t0\n' "$id" "$title" "$required" >> "$RESULTS"
  printf '%s\n' "$reason" > "$LOG_DIR/$id.log"
}

set -e
run_check install "Frozen dependency installation" yes pnpm install --frozen-lockfile
run_check format "Formatting" yes pnpm format:check
run_check lint "Lint" yes pnpm lint
run_check typecheck "TypeScript type check" yes pnpm typecheck
run_check unit "Unit and integration tests" yes pnpm test
run_check build "Production web/functions build" yes pnpm build
run_check security "Static security gate" yes pnpm security:check
run_check git-diff "Git whitespace and conflict-marker check" yes bash -lc 'git diff --check && ! git grep -nE "^(<<<<<<<|=======|>>>>>>>)" -- . ":(exclude)reports"'
run_check audit "Production dependency vulnerability audit" yes pnpm audit --prod --audit-level high

if command -v java >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  run_check rules "Firestore and Storage emulator rules tests" yes pnpm test:rules
else
  skip_check rules "Firestore and Storage emulator rules tests" yes "Java or pnpm is unavailable in this environment. CI is configured to run this mandatory gate."
fi

ANDROID_DIR="$ROOT/apps/teacher-mobile/android"
if [[ -x "$ANDROID_DIR/gradlew" ]] && [[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]]; then
  run_check android "Android unit tests and debug APK" yes bash -lc 'cd apps/teacher-mobile && pnpm build && pnpm exec cap sync android && cd android && ./gradlew --no-daemon testDebugUnitTest assembleDebug'
else
  skip_check android "Android unit tests and debug APK" conditional "Android SDK or Gradle wrapper is unavailable locally. The GitHub Android CI job is mandatory before release."
fi

now=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
commit=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || printf 'uncommitted')
branch=$(git -C "$ROOT" branch --show-current 2>/dev/null || printf 'unknown')

{
  printf '# School NFC Release Verification\n\n'
  printf -- '- Generated: `%s`\n' "$now"
  printf -- '- Branch: `%s`\n' "$branch"
  printf -- '- Starting commit: `%s`\n\n' "$commit"
  printf '| Check | Requirement | Result | Duration |\n'
  printf '|---|---:|---:|---:|\n'
  while IFS=$'\t' read -r id title required status seconds; do
    if [[ "$status" == "0" ]]; then result='PASS'; elif [[ "$status" == "SKIPPED" ]]; then result='SKIPPED'; else result="FAIL ($status)"; fi
    printf '| %s | %s | %s | %ss |\n' "$title" "$required" "$result" "$seconds"
  done < "$RESULTS"
  printf '\n## Evidence\n\n'
  while IFS=$'\t' read -r id title required status seconds; do
    printf '### %s\n\n' "$title"
    printf '```text\n'
    tail -n 80 "$LOG_DIR/$id.log" | sed -E 's/(password|token|secret|api[_-]?key)([=: ]+)[^ ]+/\1\2[REDACTED]/Ig'
    printf '\n```\n\n'
  done < "$RESULTS"
  printf '## Deployment prerequisites not stored in source\n\n'
  printf -- '- Firebase development/staging/production project IDs\n'
  printf -- '- Admin web Firebase/App Check environment values\n'
  printf -- '- Android `google-services.json` for each environment\n'
  printf -- '- Android release keystore and passwords\n'
  printf -- '- GitHub Workload Identity Provider and deploy service account\n'
  printf -- '- Initial platform-admin UID\n'
} > "$REPORT"

mandatory_failures=$(awk -F '\t' '$3=="yes" && $4!="0" { count++ } END { print count+0 }' "$RESULTS")
printf '%s\n' "$mandatory_failures" > "$REPORT_DIR/mandatory-failures.count"
printf 'Verification report: %s\nMandatory failures: %s\n' "$REPORT" "$mandatory_failures"
exit "$mandatory_failures"
