#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Actions-only exact D408 source required' >&2;exit 1; }
out="${1:?fresh same-run D408 build directory required}"
node --input-type=module - "$out" <<'NODE'
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const out=await fs.realpath(process.argv[2]),temp=await fs.realpath(process.env.RUNNER_TEMP);
if(path.dirname(out)!==temp||!path.basename(out).startsWith('d408-native-'))throw Error('Confined D408 output required');
const identity=JSON.parse(await fs.readFile(out+'/d408-build-identity.json','utf8'));
if(identity.sourceSHA!==process.env.GITHUB_SHA||identity.runId!==process.env.GITHUB_RUN_ID||identity.runAttempt!==process.env.GITHUB_RUN_ATTEMPT||identity.packageName!=='local.gxtodo.d408candidate'||identity.syntheticOnly!==true)throw Error('Same-run D408 identity required');
const sums=await fs.readFile(out+'/SHA256SUMS.txt','utf8');
for(const name of ['mytodo-d4-08-native-candidate.apk','mytodo-d4-08-native-tests.apk','d408-build-identity.json']){const expected=sums.trim().split('\n').filter(line=>line.slice(66)===name);if(expected.length!==1||expected[0].slice(0,64)!==crypto.createHash('sha256').update(await fs.readFile(out+'/'+name)).digest('hex'))throw Error('Artifact checksum mismatch: '+name);}
NODE
pkg=local.gxtodo.d408candidate
component=local.gxtodo.d408candidate.tests/local.gxtodo.replica.D408IntegrationInstrumentation
evidence="$out/native-evidence"
mkdir "$evidence"
collect() {
  adb logcat -d -v threadtime > "$evidence/logcat.raw.txt" 2>&1 || true
  adb shell dumpsys notification --noredact > "$evidence/notification.raw.txt" 2>&1 || true
  adb shell dumpsys alarm > "$evidence/alarm.raw.txt" 2>&1 || true
  adb shell dumpsys activity services "$pkg" > "$evidence/services.raw.txt" 2>&1 || true
  adb exec-out run-as "$pkg" tar -cf - files/d408-evidence > "$evidence/device-evidence.tar" 2> "$evidence/pull-error.txt" || true
  if [[ -s "$evidence/device-evidence.tar" ]];then tar -xf "$evidence/device-evidence.tar" -C "$evidence" || true;fi
}
cleanup() {
  collect
  adb shell wm size reset >/dev/null 2>&1 || true
  adb shell wm density reset >/dev/null 2>&1 || true
}
trap cleanup EXIT
[[ "${ANDROID_SERIAL:-}" == emulator-5554 && "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]] || { echo 'Isolated emulator required' >&2;exit 1; }
adb install "$out/mytodo-d4-08-native-candidate.apk" > "$evidence/install-app.txt"
adb install "$out/mytodo-d4-08-native-tests.apk" > "$evidence/install-tests.txt"
adb shell pm grant "$pkg" android.permission.POST_NOTIFICATIONS
adb shell appops set "$pkg" SCHEDULE_EXACT_ALARM allow
adb shell locksettings set-disabled false
adb shell input keyevent 224
adb shell wm dismiss-keyguard
adb logcat -c
phase() {
  adb shell am instrument -w -r -e phase "$1" "$component" | tee "$evidence/instrumentation-$1.raw.txt"
}
phase main
phase features
phase feedback-ui
adb shell cmd overlay list > "$evidence/navigation-overlays-before.txt"
for mode in gestural threebutton;do
  overlay="$(awk -v suffix=".navbar.$mode" 'index($NF,suffix)==length($NF)-length(suffix)+1 {print $NF}' "$evidence/navigation-overlays-before.txt")"
  [[ "$overlay" =~ ^com\.android\.internal\.systemui\.navbar\.(gestural|threebutton)$ ]] || { echo "Required installed navigation overlay missing/ambiguous: $mode" > "$evidence/navigation-$mode-unavailable.txt";exit 2; }
  adb shell cmd overlay enable-exclusive --category "$overlay" > "$evidence/navigation-$mode-change.txt"
  adb shell cmd overlay list > "$evidence/navigation-$mode-after.txt"
  grep -F "[x] $overlay" "$evidence/navigation-$mode-after.txt" >/dev/null || { echo 'Navigation overlay did not activate' >&2;exit 2; }
  adb shell settings get secure navigation_mode > "$evidence/navigation-$mode-setting.txt"
  for width in 360 412;do
    adb shell wm density 160
    adb shell wm size "${width}x900"
    adb shell wm size > "$evidence/wm-size-$width-$mode.txt"
    adb shell wm density > "$evidence/wm-density-$width-$mode.txt"
    phase "navigation-$width-$mode"
  done
done
for width in 360 412;do
  adb shell wm density 160
  adb shell wm size "${width}x900"
  phase "visual-$width"
done
adb shell wm size reset
adb shell wm density reset
phase process-prepare
adb shell am start -W -n "$pkg/local.gxtodo.replica.MainActivity" > "$evidence/start-before-kill.txt"
pid="$(adb shell pidof "$pkg" | tr -d '\r')"
[[ "$pid" =~ ^[0-9]+$ ]] || exit 1
printf '%s\n' "$pid" > "$evidence/killed-pid.txt"
adb shell run-as "$pkg" kill -9 "$pid"
sleep 2
adb shell am start -W -n "$pkg/local.gxtodo.replica.MainActivity" > "$evidence/start-after-kill.txt"
phase process-recover
adb shell pm revoke "$pkg" android.permission.POST_NOTIFICATIONS
phase notification-denied
adb shell pm grant "$pkg" android.permission.POST_NOTIFICATIONS
phase notification-restored
adb shell appops set "$pkg" SCHEDULE_EXACT_ALARM deny
phase exact-denied
adb shell appops set "$pkg" SCHEDULE_EXACT_ALARM allow
phase boot-prepare
collect
adb shell settings get global boot_count > "$evidence/boot-count-before.txt"
adb reboot
timeout 120s adb wait-for-device
deadline=$((SECONDS+180))
until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null|tr -d '\r')" == 1 ]];do [[ $SECONDS -lt $deadline ]]||exit 1;sleep 3;done
adb shell input keyevent 224
adb shell wm dismiss-keyguard
adb shell settings get global boot_count > "$evidence/boot-count-after.txt"
adb shell dumpsys activity services "$pkg" > "$evidence/boot-service-before-open.txt"
phase boot-recover
collect
node --input-type=module - "$evidence" <<'NODE'
import fs from 'node:fs/promises';
const root=process.argv[2],groups={retained:['main','visual-360','visual-412','process-prepare','process-recover'],features:['features'],feedbackUi:['feedback-ui'],navigation:['navigation-360-gestural','navigation-412-gestural','navigation-360-threebutton','navigation-412-threebutton'],permissions:['notification-denied','notification-restored','exact-denied'],reboot:['boot-prepare','boot-recover']},results={};
let failed=false;
for(const [name,phases] of Object.entries(groups)){const reports=[];for(const phase of phases){const p=JSON.parse(await fs.readFile(root+'/files/d408-evidence/result-'+phase+'.json','utf8'));if(p.sourceSHA!==process.env.GITHUB_SHA||p.runId!==process.env.GITHUB_RUN_ID||p.runAttempt!==process.env.GITHUB_RUN_ATTEMPT)throw Error('Identity mismatch '+phase);reports.push(p);}const cases=reports.flatMap(r=>r.cases);results[name]={caseCount:cases.length,passed:cases.filter(c=>c.passed).length,failed:cases.filter(c=>!c.passed).length,reports};if(results[name].failed)failed=true;}
await fs.writeFile(root+'/aggregate.json',JSON.stringify({sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,syntheticEmulatorOnly:true,
 groups:results,allGroupsPassed:!failed,notes:'D408 adapted retention suite is separate from unchanged D403/D405 jobs; actual reboot and permissions have independent counts.'},null,2)+'\n');
if(results.retained.caseCount!==15||results.features.caseCount!==7||results.feedbackUi.caseCount!==7||results.navigation.caseCount!==20||results.permissions.caseCount!==3||results.reboot.caseCount!==2)throw Error('D408 coverage incomplete');
if(failed)throw Error('D408 cases failed; preserve all original evidence');
NODE
