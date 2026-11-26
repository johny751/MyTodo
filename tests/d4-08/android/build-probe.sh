#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Actions-only exact probe source required' >&2; exit 1; }
out="${1:?fresh RUNNER_TEMP/d408-probe-* required}"
[[ "$(dirname "$out")" == "$RUNNER_TEMP" && "$(basename "$out")" == d408-probe-* && ! -e "$out" ]] || { echo 'Fresh confined probe output required' >&2; exit 1; }
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
bt="$sdk/build-tools/35.0.0"
android_jar="$sdk/platforms/android-35/android.jar"
[[ -f "$android_jar" ]] || exit 1
mkdir -p "$out/classes" "$out/dex"
"$bt/aapt2" link -I "$android_jar" --manifest tests/d4-08/android/AndroidManifest.xml -o "$out/unsigned.apk" > "$out/aapt2.raw.log" 2>&1
find tests/d4-08/android/local -name '*.java' -print | LC_ALL=C sort > "$out/java-sources.txt"
javac -encoding UTF-8 --release 17 -implicit:none -sourcepath '' -classpath "$android_jar" -d "$out/classes" @"$out/java-sources.txt" > "$out/javac.raw.log" 2>&1
jar cf "$out/classes.jar" -C "$out/classes" .
"$bt/d8" --lib "$android_jar" --min-api 26 --output "$out/dex" "$out/classes.jar" > "$out/d8.raw.log" 2>&1
(cd "$out/dex"; zip -q "$out/unsigned.apk" classes*.dex)
"$bt/zipalign" -p 4 "$out/unsigned.apk" "$out/aligned.apk"
keytool -genkeypair -keystore "$out/probe-ci.jks" -storepass android -keypass android -alias probe -keyalg RSA -keysize 2048 -validity 30 -dname 'CN=D408 isolated test driver' > "$out/keygen.public.log" 2>&1
"$bt/apksigner" sign --ks "$out/probe-ci.jks" --ks-pass pass:android --key-pass pass:android --ks-key-alias probe --out "$out/d408-probe.apk" "$out/aligned.apk"
"$bt/apksigner" verify --verbose --print-certs "$out/d408-probe.apk" > "$out/probe-signature.txt"
node --input-type=module - "$out" <<'NODE'
import fs from 'node:fs/promises';import crypto from 'node:crypto';
const out=process.argv[2],sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const inputs=(await fs.readFile(out+'/java-sources.txt','utf8')).trim().split('\n');inputs.push('tests/d4-08/android/AndroidManifest.xml','tests/d4-08/android/build-probe.sh');
const sourceFiles=await Promise.all(inputs.map(async path=>({path,sha256:sha(await fs.readFile(path))})));
await fs.writeFile(out+'/probe-build-identity.json',JSON.stringify({sourceSHA:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,
 packageName:'local.gxtodo.d408probe',targetPackage:'local.gxtodo.d408probe',selfInstrumented:true,appRebuilt:false,buildTimeUTC:new Date().toISOString(),sourceFiles,apkSha256:sha(await fs.readFile(out+'/d408-probe.apk'))},null,2)+'\n');
NODE
(cd "$out"; sha256sum d408-probe.apk probe-build-identity.json probe-signature.txt) > "$out/SHA256SUMS.txt"
