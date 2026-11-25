#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" ]] || { echo 'Actions-only instrumentation' >&2; exit 1; }
[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Checkout identity differs' >&2; exit 1; }
build="${1:?platform build directory required}"
out="${2:?fresh RUNNER_TEMP evidence directory required}"
case "$out" in "$RUNNER_TEMP"/d4-native-evidence-*) ;; *) echo 'Cloud temporary evidence path required' >&2; exit 1;; esac
[[ ! -e "$out" && -f "$build/mytodo-d4-03-isolated-preview.apk" && -f "$build/mytodo-d4-03-isolated-tests.apk" ]] || { echo 'Fresh evidence and both isolated APKs required' >&2; exit 1; }
mkdir "$out"
(cd "$build"; sha256sum --strict -c platform-SHA256SUMS.txt) > "$out/installed-artifact-hash-check.txt"
serial="${ANDROID_SERIAL:?Explicit isolated Actions emulator serial required}"
adb -s "$serial" wait-for-device
adb -s "$serial" shell getprop > "$out/emulator-getprop.txt"
adb -s "$serial" shell wm size > "$out/emulator-size.txt"
adb -s "$serial" shell wm density > "$out/emulator-density.txt"
# Reset ONLY the known synthetic preview; never touch an original app package.
adb -s "$serial" install -r "$build/mytodo-d4-03-isolated-preview.apk" > "$out/install-preview.txt"
adb -s "$serial" install -r "$build/mytodo-d4-03-isolated-tests.apk" > "$out/install-tests.txt"
adb -s "$serial" shell pm clear local.gxtodo.d403preview > "$out/clear-independent-preview.txt"
adb -s "$serial" logcat -c
set +e
adb -s "$serial" shell am instrument -w local.gxtodo.d403preview.tests/.PreviewInstrumentation > "$out/instrumentation.raw.log" 2>&1
instrument_status=$?
adb -s "$serial" logcat -d -v threadtime > "$out/emulator-logcat.raw.log" 2>&1
adb -s "$serial" exec-out run-as local.gxtodo.d403preview tar -c -f - files/d403-evidence > "$out/native-evidence.tar" 2> "$out/evidence-extract.raw.log"
extract_status=$?
set -e
if [[ "$extract_status" -ne 0 ]]; then cat "$out/evidence-extract.raw.log" >&2; echo 'Missing native report; raw logs retained' >&2; exit 1; fi
tar -xf "$out/native-evidence.tar" -C "$out"
printf '%s\n' "$instrument_status" > "$out/adb-instrument-exit-code.txt"
# am instrument's exit code alone does not establish test success.
node tests/d4-03-platforms/verify-native-report.mjs "$out/files/d403-evidence/report.json" "$out" "$build/platform-build-identity.json"
