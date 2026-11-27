#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Actions-only exact D408 source required' >&2;exit 1; }
out="${1:?fresh same-run D408 build directory required}"
node --input-type=module - "$out" <<'NODE'
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const out=await fs.realpath(process.argv[2]),temp=await fs.realpath(process.env.RUNNER_TEMP);
if(path.dirname(out)!==temp||!path.basename(out).startsWith('d408-native-'))throw Error('Confined D408 output required');
const identity=JSON.parse(await fs.readFile(out+'/d408-build-identity.json','utf8'));
if(identity.sourceSHA!==process.env.GITHUB_SHA||identity.runId!==process.env.GITHUB_RUN_ID||identity.runAttempt!==process.env.GITHUB_RUN_ATTEMPT||identity.runNumber!==process.env.GITHUB_RUN_NUMBER||identity.workflowName!==process.env.GITHUB_WORKFLOW||identity.packageName!=='local.gxtodo.d408candidate'||identity.syntheticOnly!==true||identity.stableSigning!==false||identity.productionSync!==false)throw Error('Same-run D408 identity required');
const sums=await fs.readFile(out+'/SHA256SUMS.txt','utf8');
for(const name of ['mytodo-d4-08-native-candidate.apk','mytodo-d4-08-native-tests.apk','d408-build-identity.json']){const expected=sums.trim().split('\n').filter(line=>line.slice(66)===name);if(expected.length!==1||expected[0].slice(0,64)!==crypto.createHash('sha256').update(await fs.readFile(out+'/'+name)).digest('hex'))throw Error('Artifact checksum mismatch: '+name);}
NODE
pkg=local.gxtodo.d408candidate
component=local.gxtodo.d408candidate.tests/local.gxtodo.replica.D408IntegrationInstrumentation
evidence="$out/native-evidence"
mkdir "$evidence"
node --input-type=module - "$evidence" <<'NODE'
import fs from 'node:fs/promises';
await fs.writeFile(process.argv[2]+'/aggregate.json',JSON.stringify({sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,syntheticEmulatorOnly:true,coverageComplete:false,allGroupsPassed:false,coverageErrors:['Runner has not completed all phases and validated their exact case IDs. Inspect preserved raw reports for an interrupted or failed run.']},null,2)+'\n');
NODE
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
for width in 360 412;do
  adb shell wm density 160
  adb shell wm size "${width}x900"
  adb shell wm size > "$evidence/wm-size-work-preservation-$width.txt"
  adb shell wm density > "$evidence/wm-density-work-preservation-$width.txt"
  phase "work-preservation-$width"
done
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
const root=process.argv[2],groups={retained:['main','visual-360','visual-412','process-prepare','process-recover'],features:['features'],feedbackUi:['feedback-ui'],workPreservation:['work-preservation-360','work-preservation-412'],navigation:['navigation-360-gestural','navigation-412-gestural','navigation-360-threebutton','navigation-412-threebutton'],permissions:['notification-denied','notification-restored','exact-denied'],reboot:['boot-prepare','boot-recover']},results={};
const expectedCounts={retained:15,features:7,feedbackUi:7,workPreservation:4,navigation:20,permissions:3,reboot:2};
const identity=JSON.parse(await fs.readFile(root+'/../d408-build-identity.json','utf8'));
const expectedIds={
 main:['01 exact-permission-and-component-policy','02 accepted-page-native-bridge-and-feedback-entry','03 single-authority-foreground-service','04-native-notification-pause-resume','05-background-keeps-session','06-lockscreen-keeps-private-timer-notification','07-activity-recreation-preserves-timer-and-draft','08-real-deadline-completion-once','09-formal-reminder-alarm-delivery-and-snooze','10-native-feedbackkit-real-editor-save','11-accepted-work-page-selection-readonly-trace'],
 features:['F01-real-native-timer-controls-and-task-picker','F02-all-history-and-native-day-statistics','F03-feedback-main-tools-list-editor-save','F04-feedback-real-image-draft-backup-restore-generation','F05-feedback-delete-batch-undo-and-stale-generation','F06-task-navigation-through-work-pages','F07-version-history-and-copy-controls'],
 'feedback-ui':['U01-system-photo-picker-preview-remove-and-draft','U02-resume-recreate-save-category-status-image','U03-delete-confirm-cancel-and-real-undo','U04-SAF-export-cancel-and-real-archive','U05-SAF-restore-cancel-confirm-and-image','U06-corrupt-restore-visible-error-and-retry','U07-empty-body-validation-and-corrected-save'],
 'visual-360':['visual-360-work-notes-real-edit-and-readonly-selection'],'visual-412':['visual-412-work-notes-real-edit-and-readonly-selection'],
 'process-prepare':['12-process-death-preparation'],'process-recover':['13-real-process-death-recovery'],
 'notification-denied':['P01-denied-notification-keeps-completion'],'notification-restored':['P02-restored-notification-delivers-pending'],'exact-denied':['P03-inexact-fallback-completes-real-minute'],
 'boot-prepare':['B01-prepare-real-device-reboot'],'boot-recover':['B02-real-device-reboot-recovers-session']
};
for(const phase of groups.navigation)expectedIds[phase]=['N01-thirteen-routes-real-wider-edge','N02-edges-distance-velocity-and-direction','N03-task-note-input-and-real-keyboard','N04-horizontal-scroll-retains-touch','N05-work-note-native-selection-and-system-back'].map(id=>phase+'-'+id);
for(const phase of groups.workPreservation)expectedIds[phase]=['W01-template-noop-rich-steps-and-instance-snapshot','W02-missing-relations-unknown-fields-and-exact-time'].map(id=>phase+'-'+id);
for(const phase of Object.keys(expectedIds))expectedIds[phase]=expectedIds[phase].map(id=>'D408-'+id).sort();
const coverageErrors=[];
let failed=false;
for(const [name,phases] of Object.entries(groups)){
  const reports=[],missingReports=[];
  for(const phase of phases){
    let p;
    try{p=JSON.parse(await fs.readFile(root+'/files/d408-evidence/result-'+phase+'.json','utf8'));}
    catch(error){coverageErrors.push(`${phase}: report missing or invalid JSON: ${error.message}`);missingReports.push(phase);continue;}
    if(!p||typeof p!=='object'||Array.isArray(p)){coverageErrors.push(`${phase}: report root is not an object`);missingReports.push(phase);continue;}
    reports.push(p);
    if(p.sourceSHA!==process.env.GITHUB_SHA||p.runId!==process.env.GITHUB_RUN_ID||p.runAttempt!==process.env.GITHUB_RUN_ATTEMPT||p.packageName!==identity.packageName||p.versionName!==identity.versionName||p.versionCode!==identity.versionCode||p.phase!==phase||p.syntheticOnly!==true||p.emulatorEvidence!==true)coverageErrors.push(`${phase}: identity or scope mismatch`);
    if(!Array.isArray(p.cases)){coverageErrors.push(`${phase}: cases not an array`);continue;}
    const names=p.cases.map(c=>c?.name),failures=p.cases.filter(c=>c?.passed!==true).length;
    if(JSON.stringify([...names].sort())!==JSON.stringify(expectedIds[phase])||new Set(names).size!==names.length)coverageErrors.push(`${phase}: missing, duplicated or unexpected case IDs`);
    if(p.caseCount!==p.cases.length||p.failureCount!==failures||p.passed!==(failures===0)||p.cases.some(c=>typeof c?.passed!=='boolean'))coverageErrors.push(`${phase}: inconsistent result counters or passed flags`);
    if(name==='workPreservation'&&p.cases.some(c=>c.phase!==phase||c.width!==Number(phase.split('-').at(-1))||(c.passed&&c.observedWidth!==c.width)||c.sourceSHA!==p.sourceSHA||c.runId!==p.runId||c.runAttempt!==p.runAttempt))coverageErrors.push(`${phase}: work-preservation case identity or width mismatch`);
  }
  const cases=reports.flatMap(r=>Array.isArray(r.cases)?r.cases:[]),failures=cases.filter(c=>c?.passed!==true).length;
  results[name]={caseCount:cases.length,passed:cases.filter(c=>c?.passed===true).length,failed:failures,missingReports,reports};
  if(failures)failed=true;
  if(cases.length!==expectedCounts[name])coverageErrors.push(`${name}: expected ${expectedCounts[name]}, observed ${cases.length}`);
}
const coverageComplete=coverageErrors.length===0;
await fs.writeFile(root+'/aggregate.json',JSON.stringify({sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,syntheticEmulatorOnly:true,
 groups:results,coverageComplete,coverageErrors,allGroupsPassed:!failed&&coverageComplete,notes:'D408 adapted retention suite is separate from unchanged D403/D405 jobs; actual reboot and permissions have independent counts.'},null,2)+'\n');
if(!coverageComplete)throw Error('D408 coverage incomplete: '+coverageErrors.join('; '));
if(failed)throw Error('D408 cases failed; preserve all original evidence');
NODE
