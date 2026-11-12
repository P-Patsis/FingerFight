#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
variant="${1:-debug}"
case "$variant" in
  debug) export FF_ANDROID_RELEASE=0 ;;
  bundle) export FF_ANDROID_RELEASE=1 ;;
  *) printf 'Usage: %s [debug|bundle]\n' "$0" >&2; exit 2 ;;
esac
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
if [ "$variant" = bundle ]; then
  (cd android && ./gradlew --no-daemon bundleRelease)
  if [ -n "${FF_UPLOAD_KEYSTORE:-}" ]; then
    bundle_output=artifacts/FingerFight-release.aab
  else
    bundle_output=artifacts/FingerFight-release-unsigned.aab
  fi
  cp android/app/build/outputs/bundle/release/app-release.aab "$bundle_output"
  node tools/android-verify-bundle.mjs "$bundle_output"
  printf 'Bundle: %s/%s\n' "$PWD" "$bundle_output"
else
  (cd android && ./gradlew --no-daemon assembleDebug)
  cp android/app/build/outputs/apk/debug/app-debug.apk artifacts/FingerFight-debug.apk
  node tools/android-verify-apk.mjs
  printf 'APK: %s/artifacts/FingerFight-debug.apk\n' "$PWD"
fi
