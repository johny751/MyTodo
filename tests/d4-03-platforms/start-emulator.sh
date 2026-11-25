#!/usr/bin/env bash
# Actions-only host readiness; preserves API35 and all native interaction assertions.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" ]] || exit 1
[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Checkout identity differs' >&2; exit 1; }
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
[[ -n "$sdk" && -d "$sdk" ]] || { echo 'Hosted official SDK required' >&2; exit 1; }
export ANDROID_HOME="$sdk" ANDROID_SDK_ROOT="$sdk"
serial="${ANDROID_SERIAL:?Explicit isolated emulator serial required}"
[[ "$serial" == emulator-5554 ]] || { echo 'Reserved D4 serial required' >&2; exit 1; }
adb="$sdk/platform-tools/adb"
emulator="$sdk/emulator/emulator"
for tool in "$adb" "$sdk/cmdline-tools/latest/bin/sdkmanager" "$sdk/cmdline-tools/latest/bin/avdmanager"; do
 [[ -x "$tool" ]] || { echo "Missing hosted SDK tool: $tool" >&2; exit 1; }
done
export ANDROID_AVD_HOME="$RUNNER_TEMP/d403-avd-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
export ANDROID_USER_HOME="$RUNNER_TEMP/d403-android-user-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
[[ ! -e "$ANDROID_AVD_HOME" && ! -e "$ANDROID_USER_HOME" ]] || { echo 'Fresh isolated emulator directories required' >&2; exit 1; }
mkdir "$ANDROID_AVD_HOME" "$ANDROID_USER_HOME"
bootlog="$RUNNER_TEMP/d403-emulator-boot.log"
envlog="$RUNNER_TEMP/d403-emulator-environment.log"
polllog="$RUNNER_TEMP/d403-emulator-poll.log"
: > "$bootlog"
: > "$envlog"
: > "$polllog"
emulator_pid=''
retain_failure() {
 local result=$?
 if [[ "$result" -ne 0 ]]; then
  set +e
  timeout 8s "$adb" devices -l >> "$envlog" 2>&1
  timeout 8s "$adb" -s "$serial" get-state >> "$envlog" 2>&1
  cat "$envlog" "$polllog" "$bootlog" >&2
  [[ -z "$emulator_pid" ]] || kill "$emulator_pid" 2>/dev/null
 fi
 exit "$result"
}
trap retain_failure EXIT
"$sdk/cmdline-tools/latest/bin/sdkmanager" 'platforms;android-35' 'system-images;android-35;google_apis;x86_64' 'emulator' >> "$envlog" 2>&1
[[ -x "$emulator" ]] || { echo 'Missing hosted emulator' >&2; exit 1; }
echo no | "$sdk/cmdline-tools/latest/bin/avdmanager" create avd --name d403 --package 'system-images;android-35;google_apis;x86_64' --device pixel_5 >> "$envlog" 2>&1
[[ -c /dev/kvm ]] || { echo 'Hosted KVM missing' >&2; exit 1; }
sudo chmod 666 /dev/kvm
"$emulator" -accel-check >> "$envlog" 2>&1
"$emulator" -version >> "$envlog" 2>&1
"$adb" version >> "$envlog" 2>&1
# Generate fresh CI-only keys; do not read, print or upload private key contents.
"$adb" keygen "$ANDROID_USER_HOME/adbkey" >> "$envlog" 2>&1
export ADB_VENDOR_KEYS="$ANDROID_USER_HOME/adbkey"
timeout 30s "$adb" start-server >> "$envlog" 2>&1
[[ -s "$ANDROID_USER_HOME/adbkey" && -s "$ANDROID_USER_HOME/adbkey.pub" ]] || { echo 'Isolated ADB key generation failed' >&2; exit 1; }
inventory="$(timeout 8s "$adb" devices -l 2>> "$envlog")"
printf '%s\n' "$inventory" >> "$envlog"
if printf '%s\n' "$inventory" | awk -v s="$serial" '$1==s {found=1} END {exit !found}'; then
 echo 'Reserved emulator serial already occupied; refusing reuse' >&2
 exit 1
fi
# Subsequent instrumentation uses the same SDK binary and CI-only auth directory.
printf '%s\n' "$sdk/platform-tools" >> "$GITHUB_PATH"
printf 'ANDROID_HOME=%s\nANDROID_SDK_ROOT=%s\nANDROID_AVD_HOME=%s\nANDROID_USER_HOME=%s\nADB_VENDOR_KEYS=%s\n' "$sdk" "$sdk" "$ANDROID_AVD_HOME" "$ANDROID_USER_HOME" "$ADB_VENDOR_KEYS" >> "$GITHUB_ENV"
nohup "$emulator" -avd d403 -port 5554 -no-window -no-snapshot -no-audio -no-boot-anim -accel on -gpu swiftshader_indirect -memory 2048 -no-metrics >> "$bootlog" 2>&1 &
emulator_pid=$!
printf 'emulator_pid=%s\nserial=%s\nsource_sha=%s\n' "$emulator_pid" "$serial" "$GITHUB_SHA" >> "$envlog"
deadline=$((SECONDS + 300))
while (( SECONDS < deadline )); do
 kill -0 "$emulator_pid" 2>/dev/null || { echo 'Emulator exited before ready; raw logs retained' >&2; exit 1; }
 printf 'poll_elapsed_seconds=%s\n' "$SECONDS" >> "$polllog"
 state="$(timeout 8s "$adb" -s "$serial" get-state 2>> "$polllog" | tr -d '\r' || true)"
 printf 'adb_state=%s\n' "$state" >> "$polllog"
 if [[ "$state" == device ]]; then
  boot="$(timeout 8s "$adb" -s "$serial" shell getprop sys.boot_completed 2>> "$polllog" | tr -d '\r' || true)"
  if [[ "$boot" == 1 ]]; then
   api="$(timeout 8s "$adb" -s "$serial" shell getprop ro.build.version.sdk | tr -d '\r')"
   abi="$(timeout 8s "$adb" -s "$serial" shell getprop ro.product.cpu.abi | tr -d '\r')"
   qemu="$(timeout 8s "$adb" -s "$serial" shell getprop ro.kernel.qemu | tr -d '\r')"
   printf 'runtime_api=%s\nruntime_abi=%s\nruntime_qemu=%s\n' "$api" "$abi" "$qemu" >> "$envlog"
   [[ "$api" == 35 && "$abi" == x86_64 && "$qemu" == 1 ]] || { echo 'API35 isolated emulator identity mismatch' >&2; exit 1; }
   timeout 8s "$adb" -s "$serial" shell dumpsys webviewupdate >> "$envlog" 2>&1
   for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
    timeout 8s "$adb" -s "$serial" shell settings put global "$setting" 0
   done
   echo 'Official isolated API35 emulator online and ready'
   exit 0
  fi
 fi
 sleep 3
done
echo 'Isolated emulator online/boot deadline exceeded; raw logs retained' >&2
exit 1
