#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export npm_config_cache="$PWD/.git/npm-cache"
export GRADLE_USER_HOME="$PWD/.android-tools/gradle-home"
export ANDROID_USER_HOME="$PWD/.android-tools/home"
export TMPDIR="$PWD/.android-tools/tmp"
export JAVA_TOOL_OPTIONS="-Duser.home=$PWD/.android-tools/home"
mkdir -p "$GRADLE_USER_HOME" "$ANDROID_USER_HOME" "$TMPDIR" artifacts
if [ "$(uname -m)" = "aarch64" ]; then node tools/android-arm.mjs; fi
if [ ! -f .android-tools/debug.keystore ]; then
  keytool -genkeypair -keystore .android-tools/debug.keystore -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=FingerFight Debug,O=Local Development,C=GR"
fi
node tools/android-model.mjs
npm run sync:android
node tools/android-check.mjs
(cd android && ./gradlew --no-daemon assembleDebug)
cp android/app/build/outputs/apk/debug/app-debug.apk artifacts/FingerFight-debug.apk
node tools/android-verify-apk.mjs
printf 'APK: %s/artifacts/FingerFight-debug.apk\n' "$PWD"
