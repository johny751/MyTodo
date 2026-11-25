import fs from 'node:fs/promises';
import path from 'node:path';
const e=process.env;
if(e.GITHUB_ACTIONS!=='true'||e.EXPECTED_SOURCE_SHA!==e.GITHUB_SHA)throw Error('Actions-only exact source evidence');
const input=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const r=JSON.parse(await fs.readFile(input,'utf8'));
const identity=JSON.parse(await fs.readFile(path.resolve(process.argv[4]),'utf8'));
const required=[
 'android-independent-package-and-bridge','android-starts-mobile-four-quadrants','android-apk-version-info-native-dialog','android-touch-zoom-and-back',
 'android-touch-full-task-menu-and-back','android-touch-drawer-item-overlay-and-left-swipe',
 'android-vertical-scroll-does-not-open-drawer','android-touch-longpress-reorder',
 'android-touch-cross-quadrant-preserves-raw-fields','android-touch-and-keyboard-autocomplete',
 'android-page-switch-restores-task-draft','android-activity-recreation-retains-synthetic-task',
 'android-native-timer-real-buttons-pause-resume','android-native-one-minute-completion-after-background-once',
 'android-touch-single-quadrant-edge-navigation','android-touch-single-quadrant-cross-move',
 'android-touch-note-create-edit-delete','android-touch-feedback-local-text-submit',
 'android-touch-sync-state-and-devices','android-native-timer-real-early-end-button',
 ...['tasks','notes','pomodoro','projects','work-items','templates','processes','analytics','settings','sync','feedback',
     'dashboard','contacts','archive','devices','data-system','about','catalogs','timeline'].map(x=>'android-touch-edge-drawer-'+x)
];
const tests=r.tests||[],names=tests.map(t=>t.name),passed=tests.filter(t=>t.status==='passed').length,failed=tests.filter(t=>t.status==='failed').length;
if(r.kind!=='mytodo-d403-native-isolated-evidence'||r.packageName!=='local.gxtodo.d403preview'||r.sourceSha!==e.GITHUB_SHA||
 r.runId!==e.GITHUB_RUN_ID||r.runAttempt!==e.GITHUB_RUN_ATTEMPT||identity.sourceSHA!==e.GITHUB_SHA||
 identity.runId!==e.GITHUB_RUN_ID||identity.runAttempt!==e.GITHUB_RUN_ATTEMPT||r.htmlSha256!==identity.html.sha256||
 r.versionName!==identity.versionName||r.versionCode!==identity.versionCode||r.buildTimeUTC!==identity.buildTimeUTC||
 r.productionDatabase!==false||r.productionSync!==false||r.total!==tests.length||r.passed!==passed||r.failed!==failed||
 new Set(names).size!==names.length||required.some(n=>!names.includes(n))||tests.some(t=>!['passed','failed'].includes(t.status)))
 throw Error('Native evidence identity/count/coverage mismatch; preserve raw logs');
await fs.writeFile(path.join(out,'native-test-summary.json'),JSON.stringify({
 sourceSha:r.sourceSha,runId:r.runId,runAttempt:r.runAttempt,htmlSha256:r.htmlSha256,
 total:r.total,passed:r.passed,failed:r.failed,requiredCoverage:required,
 evidenceKind:r.platform,productionDatabase:false,productionSync:false,unverified:r.unverified
},null,2)+'\n');
console.log(JSON.stringify({total:r.total,passed:r.passed,failed:r.failed,sourceSha:r.sourceSha}));
if(r.failed!==0)throw Error('Native tests failed: '+tests.filter(t=>t.status==='failed').map(t=>t.name).join(', '));
