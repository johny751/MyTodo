#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Actions-only exact source build' >&2; exit 1; }
demo="${1:?same-run verified HTML required}"
out="${2:?fresh RUNNER_TEMP/d408-native-* output required}"
node android/d408/prepare.mjs "$demo" "$out"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
api="${D4_ANDROID_API:-35}"
android_jar="$sdk/platforms/android-$api/android.jar"
tools_version="${D4_ANDROID_BUILD_TOOLS:-35.0.0}"
bt="$sdk/build-tools/$tools_version"
[[ -f "$android_jar" ]] || { echo 'Required official SDK missing; no automatic download' >&2; exit 1; }
for tool in aapt2 d8 zipalign apksigner; do [[ -x "$bt/$tool" ]] || { echo "Missing $tool" >&2; exit 1; }; done
mkdir -p "$out/feedback-aar" "$out/classes" "$out/dex" "$out/resources-generated"
(cd "$out/feedback-aar"; jar xf "$GITHUB_WORKSPACE/android/libs/feedback-kit-1.2.0.aar")
# Same pinned library manifest merge used by the formal builder, inside a fresh CI directory.
node --input-type=module - "$out" <<'NODE'
import fs from 'node:fs/promises';
const out=process.argv[2], library=await fs.readFile(out+'/feedback-aar/AndroidManifest.xml','utf8');
if(!library.includes('package="com.androidshared.feedback"')||library.includes('<uses-permission'))throw Error('Unexpected FeedbackKit manifest');
const app=library.match(/<application(?:\s[^>]*)?>([\s\S]*?)<\/application>/)?.[1];
if(!app?.includes('com.androidshared.feedback.FeedbackActivity')||!app.includes('com.androidshared.feedback.FeedbackFileProvider'))throw Error('FeedbackKit components missing');
const host=await fs.readFile(out+'/AndroidManifest.xml','utf8');
await fs.writeFile(out+'/AndroidManifest.xml',host.replace('</application>',app.replace(/\$\{applicationId\}/g,'local.gxtodo.d408candidate')+'\n</application>'));
NODE
"$bt/aapt2" compile --dir android/res -o "$out/resources.zip"
"$bt/aapt2" compile --dir "$out/feedback-aar/res" -o "$out/feedback-resources.zip"
"$bt/aapt2" link -I "$android_jar" --manifest "$out/AndroidManifest.xml" -A "$out/assets" --java "$out/resources-generated" \
 --extra-packages com.androidshared.feedback -o "$out/unsigned.apk" "$out/resources.zip" "$out/feedback-resources.zip"
# Compile the formal Java source in isolation before any candidate classes exist.
# Only formal source, generated R.java, the SDK and the pinned AAR are inputs.
mkdir -p "$out/formal-classes"
find android/src -name '*.java' -print > "$out/formal-java-sources.txt"
find "$out/resources-generated" -name 'R.java' -print >> "$out/formal-java-sources.txt"
LC_ALL=C sort -o "$out/formal-java-sources.txt" "$out/formal-java-sources.txt"
javac -version > "$out/formal-javac-version.txt" 2>&1
javac -encoding UTF-8 --release 17 -implicit:none -sourcepath '' -classpath "$android_jar:$out/feedback-aar/classes.jar" \
 -d "$out/formal-classes" @"$out/formal-java-sources.txt" 2>&1 | tee "$out/formal-compile-log.txt"
node --input-type=module - "$out" "$android_jar" <<'NODE'
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const out=process.argv[2],hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const list=await fs.readFile(out+'/formal-java-sources.txt','utf8'),sources=list.trim().split('\n');
if(!sources.length||sources.some(p=>!p.startsWith('android/src/')&&!(p.startsWith(out+'/resources-generated/')&&p.endsWith('/R.java'))))throw Error('Unexpected formal compile input');
const files=await Promise.all(sources.map(async p=>({path:p.startsWith(out+'/')?'build/'+p.slice(out.length+1):p,sha256:hash(await fs.readFile(p))})));
async function classes(dir){const rows=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())rows.push(...await classes(p));else if(entry.name.endsWith('.class'))rows.push(path.relative(out+'/formal-classes',p));}return rows;}
const compiled=(await classes(out+'/formal-classes')).sort();
if(!compiled.includes('local/gxtodo/replica/NativeIntegration.class')||compiled.some(p=>p.startsWith('local/gxtodo/d403preview/')||/\/D408[^/]*\.class$/.test('/'+p)))throw Error('Formal compile leaked candidate classes');
const aarSHA256=hash(await fs.readFile('android/libs/feedback-kit-1.2.0.aar'));
if(aarSHA256!=='4c55a583a2641dfb68a90700a0759adec3e4ab1562dc5ccef7cbbc06e2896ade')throw Error('Pinned AAR mismatch');
await fs.writeFile(out+'/formal-source-compile.json',JSON.stringify({sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,
 passed:true,kind:'formal-source-isolated-javac',formalPackageBuiltOrInstalled:false,compiler:(await fs.readFile(out+'/formal-javac-version.txt','utf8')).trim(),
 classpath:['official Android SDK android.jar','pinned FeedbackKit classes.jar'],sdkJarSHA256:hash(await fs.readFile(process.argv[3])),aarSHA256,sourceListSHA256:hash(list),
 sources:files,compiledClasses:compiled,excludedInputs:['android/d408/src','generated D4-03 timer source','candidate classes']},null,2)+'\n');
NODE
find android/src -name '*.java' ! -name 'NativeIntegration.java' -print > "$out/java-sources.txt"
find android/d408/src "$out/generated" "$out/resources-generated" -name '*.java' -print >> "$out/java-sources.txt"
javac -encoding UTF-8 --release 17 -classpath "$android_jar:$out/feedback-aar/classes.jar" -d "$out/classes" @"$out/java-sources.txt"
jar cf "$out/classes.jar" -C "$out/classes" .
"$bt/d8" --lib "$android_jar" --min-api 26 --output "$out/dex" "$out/classes.jar" "$out/feedback-aar/classes.jar"
(cd "$out/dex"; zip -q "$out/unsigned.apk" classes*.dex)
"$bt/zipalign" -p 4 "$out/unsigned.apk" "$out/aligned.apk"
# Ephemeral isolated identity is unrelated to both formal release and D4-03 identities.
keytool -genkeypair -keystore "$out/isolated-d408-key.jks" -storepass android -keypass android -alias d408ci \
 -keyalg RSA -keysize 2048 -validity 30 -dname 'CN=MyTodo D4-08 Isolated CI'
"$bt/apksigner" sign --ks "$out/isolated-d408-key.jks" --ks-pass pass:android --key-pass pass:android --ks-key-alias d408ci \
 --out "$out/mytodo-d4-08-native-candidate.apk" "$out/aligned.apk"
"$bt/apksigner" verify --verbose --print-certs "$out/mytodo-d4-08-native-candidate.apk" > "$out/apk-signature.txt"
"$bt/aapt2" dump badging "$out/mytodo-d4-08-native-candidate.apk" > "$out/apk-badging.txt"
"$bt/aapt2" dump permissions "$out/mytodo-d4-08-native-candidate.apk" > "$out/apk-permissions.txt"
node --input-type=module - "$out" <<'NODE'
import fs from 'node:fs/promises';
const out=process.argv[2], text=await fs.readFile(out+'/apk-permissions.txt','utf8');
const actual=[...text.matchAll(/uses-permission(?:-sdk-\d+)?: name='([^']+)'/g)].map(x=>x[1]).sort();
const allowed=['POST_NOTIFICATIONS','FOREGROUND_SERVICE','FOREGROUND_SERVICE_SPECIAL_USE','SCHEDULE_EXACT_ALARM','RECEIVE_BOOT_COMPLETED'].map(x=>'android.permission.'+x).sort();
if(JSON.stringify(actual)!==JSON.stringify(allowed))throw Error('D4-08 exact permission whitelist mismatch: '+actual);
await fs.writeFile(out+'/permission-policy.json',JSON.stringify({actual,allowed,matched:true},null,2)+'\n');
NODE
mkdir -p "$out/test-classes" "$out/test-dex"
"$bt/aapt2" link -I "$android_jar" --manifest tests/d4-08/android/native/AndroidManifest.xml -o "$out/test-unsigned.apk"
find tests/d4-08/android/native -name '*.java' -print > "$out/test-java-sources.txt"
javac -encoding UTF-8 --release 17 -classpath "$android_jar:$out/classes:$out/feedback-aar/classes.jar" -d "$out/test-classes" @"$out/test-java-sources.txt"
jar cf "$out/test-classes.jar" -C "$out/test-classes" .
"$bt/d8" --lib "$android_jar" --classpath "$out/classes.jar" --classpath "$out/feedback-aar/classes.jar" --min-api 26 --output "$out/test-dex" "$out/test-classes.jar"
(cd "$out/test-dex"; zip -q "$out/test-unsigned.apk" classes*.dex)
"$bt/zipalign" -p 4 "$out/test-unsigned.apk" "$out/test-aligned.apk"
"$bt/apksigner" sign --ks "$out/isolated-d408-key.jks" --ks-pass pass:android --key-pass pass:android --ks-key-alias d408ci \
 --out "$out/mytodo-d4-08-native-tests.apk" "$out/test-aligned.apk"
"$bt/apksigner" verify --verbose --print-certs "$out/mytodo-d4-08-native-tests.apk" > "$out/test-apk-signature.txt"
(cd "$out"; sha256sum mytodo-d4-08-native-candidate.apk mytodo-d4-08-native-tests.apk assets/index.html d408-build-identity.json formal-source-compile.json formal-java-sources.txt) > "$out/SHA256SUMS.txt"
echo 'D4-08 built; runtime unverified until separate instrumentation evidence.'
