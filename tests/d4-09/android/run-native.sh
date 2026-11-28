#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Actions-only exact D409 source required' >&2; exit 1; }
out="${1:?same-run candidate build and retained-suite evidence required}"
node tests/d4-09/android/verify-native.mjs run-input "$out"
[[ "${ANDROID_SERIAL:-}" == emulator-5554 && "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]] || { echo 'Same isolated emulator required' >&2; exit 1; }
pkg=local.gxtodo.d408candidate
component=local.gxtodo.d408candidate.d409uitests/local.gxtodo.replica.D409UiInstrumentation
evidence="$out/d409-native-ui-evidence"
mkdir "$evidence"
node tests/d4-09/android/verify-native.mjs start "$out"
collect() {
  adb logcat -d -v threadtime > "$evidence/logcat.raw.txt" 2>&1 || true
  adb shell dumpsys window > "$evidence/window.raw.txt" 2>&1 || true
  adb shell dumpsys activity services "$pkg" > "$evidence/services.raw.txt" 2>&1 || true
  adb shell cmd overlay list > "$evidence/overlays-final.txt" 2>&1 || true
  # Setup can stop before instrumentation creates any report directory. Preserve
  # that absence explicitly instead of treating remote diagnostic text as a TAR.
  if adb shell run-as "$pkg" test -d files/d409-evidence > "$evidence/device-evidence-directory.txt" 2>&1; then
    if adb exec-out run-as "$pkg" tar -cf - files/d409-evidence > "$evidence/device-evidence.tar" 2> "$evidence/pull-error.txt"; then
      if tar -tf "$evidence/device-evidence.tar" > "$evidence/device-evidence-members.txt" 2> "$evidence/tar-validation-error.txt"; then
        tar -xf "$evidence/device-evidence.tar" -C "$evidence" > "$evidence/tar-extract.txt" 2>&1 || true
      else
        printf '%s\n' 'Collected device bytes are not a valid TAR; raw bytes retained.' > "$evidence/collection-status.txt"
      fi
    else
      printf '%s\n' 'Device evidence collection failed; raw stdout and stderr retained.' > "$evidence/collection-status.txt"
    fi
  else
    printf '%s\n' 'No D409 device evidence directory exists; instrumentation did not create reports. No cases are inferred as passed.' > "$evidence/collection-status.txt"
  fi
}
cleanup() {
  collect
  adb shell wm size reset >/dev/null 2>&1 || true
  adb shell wm density reset >/dev/null 2>&1 || true
}
trap cleanup EXIT
# The frozen D408 runner has already installed this exact APK. Do not reinstall,
# clear its synthetic data, uninstall either package, or replace the original reports.
adb shell pm path "$pkg" > "$evidence/installed-app-path.txt"
installed="$(tr -d '\r' < "$evidence/installed-app-path.txt" | sed -n 's/^package://p')"
[[ "$installed" == /data/app/*/base.apk && "$installed" != *$'\n'* && "$installed" != *' '* ]] || { echo 'One installed candidate base APK required' >&2; exit 1; }
adb exec-out cat "$installed" | sha256sum > "$evidence/installed-app-sha256.txt"
node tests/d4-09/android/verify-native.mjs installed "$out"
adb install "$out/mytodo-d4-09-native-ui-tests.apk" > "$evidence/install-ui-tests.txt"
adb shell pm grant "$pkg" android.permission.POST_NOTIFICATIONS
adb shell appops set "$pkg" SCHEDULE_EXACT_ALARM allow
adb shell input keyevent 224
adb shell wm dismiss-keyguard
adb shell cmd overlay list > "$evidence/overlays-before.txt"
for mode in gestural threebutton; do
  overlay="com.android.internal.systemui.navbar.$mode"
  grep -F "$overlay" "$evidence/overlays-before.txt" >/dev/null || { echo "Missing installed $overlay" >&2; exit 2; }
  adb shell cmd overlay enable-exclusive --category "$overlay" > "$evidence/overlay-$mode-change.txt"
  expected_mode=0
  [[ "$mode" != gestural ]] || expected_mode=2
  # Overlay-manager completion precedes SystemUI's asynchronous mode update.
  # Observe both actual signals under one deadline; never write navigation_mode
  # or reissue the activation to manufacture a successful configuration.
  mode_started=$SECONDS
  mode_deadline=$((mode_started+15))
  while :; do
    adb shell cmd overlay list > "$evidence/overlay-$mode-after.txt"
    observed_mode="$(adb shell settings get secure navigation_mode | tr -d '\r')"
    overlay_active=false
    if grep -F "[x] $overlay" "$evidence/overlay-$mode-after.txt" >/dev/null; then overlay_active=true; fi
    printf 'elapsedSeconds=%s requested=%s expected=%s observed=%s overlayActive=%s\n' "$((SECONDS-mode_started))" "$mode" "$expected_mode" "$observed_mode" "$overlay_active" >> "$evidence/navigation-$mode-readiness.txt"
    [[ $SECONDS -lt $mode_deadline ]] || { echo 'Actual navigation mode did not become ready within 15 seconds' >&2; exit 2; }
    if [[ "$overlay_active" == true && "$observed_mode" == "$expected_mode" ]]; then break; fi
    sleep 0.2
  done
  for width in 360 412; do
    phase="ui-$width-$mode"
    adb shell wm density 160
    adb shell wm size "${width}x900"
    adb shell wm size > "$evidence/wm-size-$phase.txt"
    adb shell wm density > "$evidence/wm-density-$phase.txt"
    adb shell settings get secure navigation_mode > "$evidence/navigation-mode-$phase.txt"
    adb shell am instrument -w -r -e phase "$phase" -e sourceSHA "$GITHUB_SHA" -e runId "$GITHUB_RUN_ID" -e runAttempt "$GITHUB_RUN_ATTEMPT" "$component" | tee "$evidence/instrumentation-$phase.raw.txt"
  done
done
collect
node tests/d4-09/android/verify-native.mjs aggregate "$out"
