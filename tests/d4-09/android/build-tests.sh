#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" && "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Actions-only exact D409 test build required' >&2; exit 1; }
out="${1:?same-run completed candidate build required}"
node tests/d4-09/android/verify-native.mjs build-input "$out"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
android_jar="$sdk/platforms/android-${D4_ANDROID_API:-35}/android.jar"
bt="$sdk/build-tools/${D4_ANDROID_BUILD_TOOLS:-35.0.0}"
[[ -f "$android_jar" && -f "$out/classes.jar" && -d "$out/classes" && -f "$out/isolated-d408-key.jks" ]] || { echo 'Same-run classes and ephemeral signing identity required' >&2; exit 1; }
for tool in aapt2 d8 zipalign apksigner; do [[ -x "$bt/$tool" ]] || { echo "Missing official SDK $tool; no automatic download" >&2; exit 1; }; done
work="$out/d409-ui-test-build"
mkdir "$work"
mkdir "$work/classes" "$work/dex"
"$bt/aapt2" link -I "$android_jar" --manifest tests/d4-09/android/native/AndroidManifest.xml -o "$work/unsigned.apk"
find tests/d4-09/android/native -name '*.java' -print | LC_ALL=C sort > "$work/java-sources.txt"
javac -encoding UTF-8 --release 17 -implicit:none -sourcepath '' -classpath "$android_jar:$out/classes:$out/feedback-aar/classes.jar" -d "$work/classes" @"$work/java-sources.txt" 2>&1 | tee "$work/javac.raw.txt"
jar cf "$work/classes.jar" -C "$work/classes" .
"$bt/d8" --lib "$android_jar" --classpath "$out/classes.jar" --classpath "$out/feedback-aar/classes.jar" --min-api 29 --output "$work/dex" "$work/classes.jar"
(cd "$work/dex"; zip -q "$work/unsigned.apk" classes*.dex)
"$bt/zipalign" -p 4 "$work/unsigned.apk" "$work/aligned.apk"
"$bt/apksigner" sign --ks "$out/isolated-d408-key.jks" --ks-pass pass:android --key-pass pass:android --ks-key-alias d408ci --out "$out/mytodo-d4-09-native-ui-tests.apk" "$work/aligned.apk"
"$bt/apksigner" verify --verbose --print-certs "$out/mytodo-d4-09-native-ui-tests.apk" > "$out/d409-ui-test-signature.txt"
"$bt/aapt2" dump badging "$out/mytodo-d4-09-native-ui-tests.apk" > "$out/d409-ui-test-badging.txt"
node tests/d4-09/android/verify-native.mjs test-built "$out"
