#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${EXPECTED_SOURCE_SHA:-}" == "${GITHUB_SHA:-}" ]] || { echo 'Actions-only build' >&2; exit 1; }
[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'Checkout identity differs' >&2; exit 1; }
demo="${1:?verified single HTML path required}"
out="${2:?fresh absolute RUNNER_TEMP/d4-platform-* output required}"
node prototypes/d4-03-platforms/prepare.mjs "$demo" "$out"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
[[ -d "$sdk/platforms" && -d "$sdk/build-tools" ]] || { echo 'Runner Android SDK missing; no dependency download fallback' >&2; exit 1; }
api="${D4_ANDROID_API:-35}"
android_jar="$sdk/platforms/android-$api/android.jar"
[[ -f "$android_jar" ]] || { echo "Runner android-$api/android.jar missing; configure official SDK in workflow" >&2; exit 1; }
tools_version="${D4_ANDROID_BUILD_TOOLS:-}"
if [[ -z "$tools_version" ]]; then tools_version="$(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -V | tail -1)"; fi
bt="$sdk/build-tools/$tools_version"
for tool in aapt2 d8 zipalign apksigner; do [[ -x "$bt/$tool" ]] || { echo "Missing runner tool $tool" >&2; exit 1; }; done
mkdir -p "$out/classes" "$out/dex"
"$bt/aapt2" compile --dir prototypes/d4-03-platforms/android/res -o "$out/resources.zip"
"$bt/aapt2" link -I "$android_jar" --manifest "$out/AndroidManifest.xml" -A "$out/assets" -o "$out/unsigned.apk" "$out/resources.zip"
find prototypes/d4-03-platforms/android/src "$out/generated" -name '*.java' -print > "$out/java-sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -classpath "$android_jar" -d "$out/classes" @"$out/java-sources.txt"
jar cf "$out/classes.jar" -C "$out/classes" .
"$bt/d8" --lib "$android_jar" --min-api 26 --output "$out/dex" "$out/classes.jar"
(cd "$out/dex"; zip -q "$out/unsigned.apk" classes*.dex)
"$bt/zipalign" -p 4 "$out/unsigned.apk" "$out/aligned.apk"
# Ephemeral key is confined to this independent preview. No production signing key.
keytool -genkeypair -keystore "$out/isolated-test-key.jks" -storepass android -keypass android -alias d403preview \
 -keyalg RSA -keysize 2048 -validity 30 -dname "CN=MyTodo D4-03 Isolated CI"
"$bt/apksigner" sign --ks "$out/isolated-test-key.jks" --ks-pass pass:android --key-pass pass:android --ks-key-alias d403preview \
 --out "$out/mytodo-d4-03-isolated-preview.apk" "$out/aligned.apk"
"$bt/apksigner" verify --verbose --print-certs "$out/mytodo-d4-03-isolated-preview.apk" > "$out/apk-signature.txt"
"$bt/aapt2" dump badging "$out/mytodo-d4-03-isolated-preview.apk" > "$out/apk-badging.txt"
"$bt/aapt2" dump permissions "$out/mytodo-d4-03-isolated-preview.apk" > "$out/apk-permissions.txt"
if grep -E 'INTERNET|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|GET_ACCOUNTS' "$out/apk-permissions.txt"; then echo 'Permission isolation violated' >&2; exit 1; fi
# Separate instrumentation APK; test code is never imported by the app.
mkdir -p "$out/test-classes" "$out/test-dex"
"$bt/aapt2" link -I "$android_jar" --manifest tests/d4-03-platforms/android/AndroidManifest.xml -o "$out/test-unsigned.apk"
find tests/d4-03-platforms/android -name '*.java' -print > "$out/test-java-sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -classpath "$android_jar:$out/classes" -d "$out/test-classes" @"$out/test-java-sources.txt"
jar cf "$out/test-classes.jar" -C "$out/test-classes" .
"$bt/d8" --lib "$android_jar" --classpath "$out/classes.jar" --min-api 26 --output "$out/test-dex" "$out/test-classes.jar"
(cd "$out/test-dex"; zip -q "$out/test-unsigned.apk" classes*.dex)
"$bt/zipalign" -p 4 "$out/test-unsigned.apk" "$out/test-aligned.apk"
"$bt/apksigner" sign --ks "$out/isolated-test-key.jks" --ks-pass pass:android --key-pass pass:android --ks-key-alias d403preview \
 --out "$out/mytodo-d4-03-isolated-tests.apk" "$out/test-aligned.apk"
sha256sum "$out/mytodo-d4-03-isolated-preview.apk" "$out/mytodo-d4-03-isolated-tests.apk" "$out/mytodo-d4-03-demo.html" > "$out/platform-SHA256SUMS.txt"
printf 'Android isolated build finished; native runtime remains UNVERIFIED until instrumentation.\n'
