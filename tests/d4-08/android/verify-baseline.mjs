import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const env = process.env;
if (env.GITHUB_ACTIONS !== 'true' || env.EXPECTED_SOURCE_SHA !== env.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim() !== env.GITHUB_SHA) throw Error('Actions-only exact probe source required');
const [rootArg, outputArg] = process.argv.slice(2);
if (!rootArg || !outputArg) throw Error('Usage: verify-baseline.mjs ARTIFACT_DIR OUTPUT_JSON');
const temp = await fs.realpath(env.RUNNER_TEMP), root = await fs.realpath(rootArg), output = path.resolve(outputArg);
const within = file => file.startsWith(temp + path.sep);
if (!within(root) || !within(output)) throw Error('Baseline input and output must stay in RUNNER_TEMP');
const files = [];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error('Baseline symlink is not an input');
    if (entry.isDirectory()) await walk(file); else files.push(file);
  }
}
await walk(root);
function unique(name) { const matches = files.filter(file => path.basename(file) === name); if (matches.length !== 1) throw Error('Expected unique artifact: ' + name); return matches[0]; }
const sha = file => fs.readFile(file).then(bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
const appApk = unique('mytodo-d4-05-native-candidate.apk'), receiptFile = unique('d405-build-identity.json');
const appApkSha256 = await sha(appApk), receiptSha256 = await sha(receiptFile);
if (appApkSha256 !== '20c9ffa70b13e02d1ed6a507594837e788cc756652e68ad8e116571b067e1480' || receiptSha256 !== 'fe9a692366b364fbe435096ab0811e6096b3f3e156e47b5214bdd028298cf896') throw Error('Frozen delivered artifact hash mismatch');
const identity = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
if (identity.sourceSHA !== '04c525c55fc136ad1b960b5d727dab3c5e3165fd' || identity.runId !== '45743320346' || identity.runAttempt !== '1' ||
    identity.packageName !== 'local.gxtodo.d405candidate' || identity.versionName !== '0.5.3' || identity.versionCode !== 405003 ||
    identity.buildTimeUTC !== '2026-11-26T02:36:03.559Z' || identity.syntheticOnly !== true || identity.stableSigning !== false) throw Error('Frozen baseline identity mismatch');
const bt = path.join(env.ANDROID_SDK_ROOT || env.ANDROID_HOME, 'build-tools', '35.0.0');
const signature = execFileSync(path.join(bt, 'apksigner'), ['verify', '--verbose', '--print-certs', appApk], {encoding:'utf8'});
const cert = 'bc34d53f93e7b1f3a5ec62281bf00d53c6f54680bfd543d113882c107e1c8b8c';
if (!signature.includes('Signer #1 certificate SHA-256 digest: ' + cert)) throw Error('Frozen signature mismatch');
const badging = execFileSync(path.join(bt, 'aapt2'), ['dump', 'badging', appApk], {encoding:'utf8'});
if (!badging.includes("package: name='local.gxtodo.d405candidate' versionCode='405003' versionName='0.5.3'")) throw Error('Installed manifest input identity mismatch');
const result = {appApk, appApkSha256, packageName:identity.packageName, launchComponent:identity.packageName+'/local.gxtodo.replica.MainActivity',
  versionName:identity.versionName,versionCode:identity.versionCode,targetSourceSHA:identity.sourceSHA,targetBuildRunId:identity.runId,
  targetBuildAttempt:identity.runAttempt,targetBuildTimeUTC:identity.buildTimeUTC,syntheticOnly:true,role:'frozen-baseline',
  receiptFile,receiptSha256,signerSHA256:cert,probeSourceSHA:env.GITHUB_SHA};
await fs.writeFile(output, JSON.stringify(result,null,2)+'\n');
await fs.writeFile(output+'.signature.txt',signature); await fs.writeFile(output+'.badging.txt',badging);
