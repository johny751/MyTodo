#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" ]] || exit 1
sdk="${ANDROID_HOME:?Hosted official SDK required}"
export ANDROID_AVD_HOME="$RUNNER_TEMP/d403-avd-$GITHUB_RUN_ID"
mkdir "$ANDROID_AVD_HOME"
"$sdk/cmdline-tools/latest/bin/sdkmanager" 'platforms;android-35' 'system-images;android-35;google_apis;x86_64' 'emulator'
echo no | "$sdk/cmdline-tools/latest/bin/avdmanager" create avd --name d403 --package 'system-images;android-35;google_apis;x86_64' --device pixel_5
sudo chmod 666 /dev/kvm
nohup "$sdk/emulator/emulator" -avd d403 -port 5554 -no-window -no-snapshot -no-audio -no-boot-anim -gpu swiftshader_indirect -memory 2048 > "$RUNNER_TEMP/d403-emulator-boot.log" 2>&1 &
for i in $(seq 1 100); do
 if [[ "$(adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then
  adb -s emulator-5554 shell settings put global window_animation_scale 0
  adb -s emulator-5554 shell settings put global transition_animation_scale 0
  adb -s emulator-5554 shell settings put global animator_duration_scale 0
  echo 'Official isolated API35 emulator ready'
  exit 0
 fi
 sleep 3
done
cat "$RUNNER_TEMP/d403-emulator-boot.log"
exit 1
