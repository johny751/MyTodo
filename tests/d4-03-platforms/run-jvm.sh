#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Exact Actions checkout required' >&2; exit 1; }
out="${1:-$RUNNER_TEMP/d4-jvm-evidence-$GITHUB_RUN_ID}"
case "$out" in "$RUNNER_TEMP"/d4-jvm-evidence-*) ;; *) echo 'Cloud temporary evidence path required' >&2; exit 1;; esac
[[ ! -e "$out" ]] || { echo 'Fresh JVM evidence directory required' >&2; exit 1; }
mkdir "$out"
classes="$out/classes"
mkdir "$classes"
set +e
javac -encoding UTF-8 --release 8 -d "$classes" \
 prototypes/d4-03-platforms/android/src/local/gxtodo/replica/PomodoroClock.java \
 tests/d4-03-platforms/jvm/PomodoroClockTest.java > "$out/javac.raw.log" 2>&1
compile_status=$?
test_status=125
if [[ "$compile_status" -eq 0 ]]; then
 java -cp "$classes" local.gxtodo.replica.PomodoroClockTest > "$out/jvm.raw.log" 2>&1
 test_status=$?
else
 printf 'UNVERIFIED: JVM test not run after compiler failure\n' > "$out/jvm.raw.log"
fi
set -e
cat "$out/javac.raw.log"
cat "$out/jvm.raw.log"
node --input-type=module - "$out" "$compile_status" "$test_status" <<'NODE'
import fs from 'node:fs/promises';
import path from 'node:path';
const [out,compileRaw,testRaw]=process.argv.slice(2),compile=Number(compileRaw),test=Number(testRaw);
const raw=await fs.readFile(path.join(out,'jvm.raw.log'),'utf8'),match=raw.match(/PomodoroClock: (\d+) assertions passed/);
const r={sourceSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,
 evidenceKind:'Frozen pure Java deterministic timer model suite; not Android lifecycle evidence',
 compilation:{passed:compile===0,exitCode:compile},total:compile===0?1:0,passed:compile===0&&test===0&&!!match?1:0,
 failed:compile===0&&(test!==0||!match)?1:0,unrun:compile===0?0:1,assertionsPassed:test===0&&match?Number(match[1]):null,
 rawLogs:['javac.raw.log','jvm.raw.log']};
await fs.writeFile(path.join(out,'jvm-test-summary.json'),JSON.stringify(r,null,2)+'\n');
console.log(JSON.stringify(r));
if(compile!==0||test!==0||!match)process.exitCode=1;
NODE
# Kept as cloud evidence; no cleanup hides compiler/test failures.
