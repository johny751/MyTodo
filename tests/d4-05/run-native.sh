#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ && "${EXPECTED_SOURCE_SHA:-}" == "$GITHUB_SHA" && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Actions-only exact source native execution' >&2; exit 1; }
out="${1:?D4-05 build output required}"
node --input-type=module - "$out" <<'NODE'
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const supplied=path.resolve(process.argv[2]),out=await fs.realpath(supplied),temp=await fs.realpath(process.env.RUNNER_TEMP);
if(out!==supplied||path.dirname(out)!==temp||!path.basename(out).startsWith('d405-native-'))throw Error('Confined nonsymlink output required before installation');
const identity=JSON.parse(await fs.readFile(out+'/d405-build-identity.json','utf8'));
if(identity.sourceSHA!==process.env.GITHUB_SHA||identity.runId!==process.env.GITHUB_RUN_ID||identity.runAttempt!==process.env.GITHUB_RUN_ATTEMPT||identity.packageName!=='local.gxtodo.d405candidate'||identity.syntheticOnly!==true)throw Error('Same run build identity required before installation');
const sums=await fs.readFile(out+'/SHA256SUMS.txt','utf8');
for(const name of ['mytodo-d4-05-native-candidate.apk','mytodo-d4-05-native-tests.apk','d405-build-identity.json']){
 const lines=sums.trim().split('\n').filter(line=>line.slice(66)===name);if(lines.length!==1)throw Error('Missing unique artifact checksum: '+name);
 const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(out,name))).digest('hex');if(lines[0].slice(0,64)!==actual)throw Error('Artifact checksum mismatch: '+name);
}
NODE
pkg=local.gxtodo.d405candidate
test_component=local.gxtodo.d405candidate.tests/local.gxtodo.replica.NativeIntegrationInstrumentation
evidence="$out/native-evidence"
mkdir -p "$evidence"
collect() {
  adb logcat -d -v threadtime > "$evidence/logcat.txt" || true
  adb shell dumpsys notification --noredact > "$evidence/notification-dump.txt" || true
  adb shell dumpsys alarm > "$evidence/alarm-dump.txt" || true
  adb shell dumpsys activity services "$pkg" > "$evidence/service-dump.txt" || true
  adb exec-out run-as "$pkg" tar -cf - files/d405-evidence > "$evidence/device-evidence.tar" || true
  if [[ -s "$evidence/device-evidence.tar" ]]; then tar -xf "$evidence/device-evidence.tar" -C "$evidence"; fi
}
cleanup() { collect; adb shell wm size reset >/dev/null 2>&1 || true; adb shell wm density reset >/dev/null 2>&1 || true; }
trap cleanup EXIT
adb install "$out/mytodo-d4-05-native-candidate.apk" | tee "$evidence/install-main.txt"
adb install "$out/mytodo-d4-05-native-tests.apk" | tee "$evidence/install-tests.txt"
adb shell pm grant "$pkg" android.permission.POST_NOTIFICATIONS
adb shell appops set "$pkg" SCHEDULE_EXACT_ALARM allow
adb shell locksettings set-disabled false
adb shell input keyevent 224
adb shell wm dismiss-keyguard
adb logcat -c
adb shell am instrument -w -r -e phase main "$test_component" | tee "$evidence/instrumentation-main.txt"
for width in 360 412; do
  adb shell wm density 160
  adb shell wm size "${width}x900"
  adb shell am instrument -w -r -e phase "visual-$width" "$test_component" | tee "$evidence/instrumentation-visual-$width.txt"
done
adb shell wm size reset
adb shell wm density reset
adb shell am instrument -w -r -e phase process-prepare "$test_component" | tee "$evidence/instrumentation-process-prepare.txt"
# External kill of this isolated package's real Linux process; no force-stop/uninstall, no clock mock.
adb shell am start -W -n "$pkg/local.gxtodo.replica.MainActivity" > "$evidence/start-before-kill.txt"
pid="$(adb shell pidof "$pkg" | tr -d '\r')"
[[ "$pid" =~ ^[0-9]+$ ]] || { echo 'Expected one isolated application process' >&2; exit 1; }
printf '%s\n' "$pid" > "$evidence/killed-pid.txt"
adb shell run-as "$pkg" kill -9 "$pid"
sleep 2
adb shell am start -W -n "$pkg/local.gxtodo.replica.MainActivity" > "$evidence/start-after-kill.txt"
adb shell am instrument -w -r -e phase process-recover "$test_component" | tee "$evidence/instrumentation-process-recover.txt"
collect
node --input-type=module - "$evidence" <<'NODE'
import fs from 'node:fs/promises';
const root=process.argv[2], reports=[];
for(const phase of ['main','visual-360','visual-412','process-prepare','process-recover']){
  const report=JSON.parse(await fs.readFile(root+'/files/d405-evidence/result-'+phase+'.json','utf8'));
  if(report.sourceSHA!==process.env.GITHUB_SHA||report.runId!==process.env.GITHUB_RUN_ID||report.runAttempt!==process.env.GITHUB_RUN_ATTEMPT)throw Error('Runtime identity mismatch: '+phase);
  reports.push(report);
}
const cases=reports.flatMap(r=>r.cases), failed=cases.filter(c=>!c.passed);
const killedPid=Number((await fs.readFile(root+'/killed-pid.txt','utf8')).trim());
const recovery=reports.find(r=>r.phase==='process-recover').cases.find(c=>c.name==='D405-13-real-process-death-recovery');
if(!Number.isSafeInteger(killedPid)||recovery?.evidence?.currentPid===killedPid)throw Error('External killed process identity not replaced');
await fs.writeFile(root+'/aggregate.json',JSON.stringify({sourceSHA:process.env.GITHUB_SHA,caseCount:cases.length,failureCount:failed.length,passed:failed.length===0,killedPid,syntheticEmulatorOnly:true,reports},null,2)+'\n');
if(cases.length!==15||failed.length)throw Error('D4-05 lifecycle cases incomplete/failed: '+cases.length+'/'+failed.length);
NODE
