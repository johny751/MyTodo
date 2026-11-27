#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Actions-only exact probe execution required' >&2; exit 1; }
input=''; probe=''; suite=''; out=''
while (($#)); do
  case "$1" in
    --input) input="$2";shift 2;;
    --probe) probe="$2";shift 2;;
    --suite) suite="$2";shift 2;;
    --out) out="$2";shift 2;;
    *) echo 'Unknown probe option' >&2;exit 1;;
  esac
done
[[ -f "$input" && -f "$probe" && "$suite" == baseline-gaps && "$(dirname "$out")" == "$RUNNER_TEMP" && "$(basename "$out")" == d408-baseline-evidence-* && ! -e "$out" ]] || { echo 'Confined fresh evidence and verified inputs required' >&2; exit 1; }
mkdir "$out"
node --input-type=module - "$input" "$probe" > "$out/verified-parameters.txt" <<'NODE'
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const [input,probe]=process.argv.slice(2),temp=await fs.realpath(process.env.RUNNER_TEMP),data=JSON.parse(await fs.readFile(input,'utf8'));
for(const p of [input,probe,data.appApk])if(!(await fs.realpath(p)).startsWith(temp+path.sep))throw Error('Input escapes RUNNER_TEMP');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(!['local.gxtodo.d405candidate','local.gxtodo.d408candidate'].includes(data.packageName)||data.syntheticOnly!==true||data.launchComponent!==data.packageName+'/local.gxtodo.replica.MainActivity'||!/^\w{40}$/.test(data.targetSourceSHA))throw Error('Candidate input contract mismatch');
if(hash(await fs.readFile(data.appApk))!==data.appApkSha256)throw Error('Target APK changed after verification');
const driver=JSON.parse(await fs.readFile(path.join(path.dirname(probe),'probe-build-identity.json'),'utf8'));
if(driver.sourceSHA!==process.env.GITHUB_SHA||driver.runId!==process.env.GITHUB_RUN_ID||driver.runAttempt!==process.env.GITHUB_RUN_ATTEMPT||driver.apkSha256!==hash(await fs.readFile(probe)))throw Error('Same-run probe identity mismatch');
for(const value of [data.appApk,data.packageName,data.launchComponent,data.targetSourceSHA,data.targetBuildRunId,data.role]){if(typeof value!=='string'||/[\r\n]/.test(value))throw Error('Invalid parameter');console.log(value);}
NODE
mapfile -t params < "$out/verified-parameters.txt"
app_apk="${params[0]}";pkg="${params[1]}";launch="${params[2]}";target_sha="${params[3]}";target_run="${params[4]}";role="${params[5]}"
[[ "${ANDROID_SERIAL:-}" == emulator-5554 && "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == 1 && "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" == 35 ]] || { echo 'Fresh isolated API35 emulator required' >&2;exit 1; }
cp "$input" "$out/verified-input.json"
cp "$(dirname "$probe")/probe-build-identity.json" "$out/probe-build-identity.json"
collect() {
  adb logcat -d -v threadtime > "$out/logcat.raw.txt" 2>&1 || true
  adb shell dumpsys notification --noredact > "$out/notification.raw.txt" 2>&1 || true
  adb shell dumpsys alarm > "$out/alarm.raw.txt" 2>&1 || true
  adb shell dumpsys window > "$out/window.raw.txt" 2>&1 || true
  adb shell dumpsys package "$pkg" > "$out/installed-package.txt" 2>&1 || true
  adb exec-out run-as local.gxtodo.d408probe tar -cf - files/d408-probe-evidence > "$out/probe-evidence.tar" 2> "$out/pull-error.txt" || true
  if [[ -s "$out/probe-evidence.tar" ]]; then tar -xf "$out/probe-evidence.tar" -C "$out" || true; fi
}
cleanup() {
  local runner_status=$?
  collect
  if ! node tests/d4-08/android/aggregate-probe.mjs "$out" "$role"; then runner_status=1; fi
  adb shell wm size reset >/dev/null 2>&1 || true
  adb shell wm density reset >/dev/null 2>&1 || true
  trap - EXIT
  exit "$runner_status"
}
trap cleanup EXIT
adb install "$app_apk" > "$out/install-target.txt"
adb install "$probe" > "$out/install-probe.txt"
adb shell pm grant "$pkg" android.permission.POST_NOTIFICATIONS
adb shell appops set "$pkg" SCHEDULE_EXACT_ALARM allow
adb shell input keyevent 224
adb shell wm dismiss-keyguard
adb shell cmd overlay list > "$out/navigation-overlays-before.txt"
adb logcat -c
for mode in gestural threebutton; do
  # Select only an observed installed navigation overlay; absence is retained as infrastructure unavailability.
  overlay="$(awk -v suffix=".navbar.$mode" 'index($NF,suffix)==length($NF)-length(suffix)+1 {print $NF}' "$out/navigation-overlays-before.txt")"
  [[ "$overlay" =~ ^com\.android\.internal\.systemui\.navbar\.(gestural|threebutton)$ ]] || { echo "Required installed navigation overlay missing/ambiguous: $mode" > "$out/navigation-$mode-unavailable.txt";exit 2; }
  adb shell cmd overlay enable-exclusive --category "$overlay" > "$out/navigation-$mode-change.txt"
  adb shell cmd overlay list > "$out/navigation-$mode-after.txt"
  grep -F "[x] $overlay" "$out/navigation-$mode-after.txt" > /dev/null || { echo 'Navigation overlay did not activate' >&2;exit 2; }
  adb shell settings get secure navigation_mode > "$out/navigation-$mode-setting.txt"
  for width in 360 412; do
    phase="$width-$mode"
    adb shell wm density 160
    adb shell wm size "${width}x900"
    adb shell wm size > "$out/wm-size-$phase.txt"
    adb shell wm density > "$out/wm-density-$phase.txt"
    adb shell am instrument -w -r -e suite "$suite" -e phase "$phase" \
      -e targetPkg "$pkg" -e targetSourceSha "$target_sha" -e targetBuildRunId "$target_run" \
      -e probeSourceSha "$GITHUB_SHA" -e evidenceRunId "$GITHUB_RUN_ID" -e evidenceAttempt "$GITHUB_RUN_ATTEMPT" \
      local.gxtodo.d408probe/local.gxtodo.d408probe.BaselineProbe | tee "$out/instrumentation-$phase.raw.txt"
  done
done
# EXIT always collects and aggregates every available phase, including aborts.
