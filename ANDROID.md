# Android prototype

Capacitor 8 packages the existing web game in Android System WebView. It is separate from Cloudflare (the undeployed account/social backend). This prototype keeps guest PeerJS multiplayer and local computer practice; no cloud account or paid service is required to build it. PeerJS still needs internet, and restrictive networks may need TURN.

Verified build: `assembleDebug` succeeds; Android v2 signature and actual APK contents verify; game tests **396/396 pass**. APK is 19,642,589 bytes (about 18.7 MiB), SHA-256 `7b4a7b74499b03235246b6c72a0201f2b1522ccf82051fb404f83dd7bb0ae34a`. Current APK: version code 5 / `0.1.4-prototype`, also copied to phone Downloads as `FingerFight-0.1.4-debug.apk`. This build adds the five previously omitted music files, compact identity/sound rows, preview Save look and picker/notice fixes. UI source `c3b1b32` is verified live on Pages. Device playback, touch/scroll and camera/FPS checks remain pending.

Shared server matchmaking is now implemented in source and tested with the native and website origins, but `API_URL` stays empty until deployment is approved and verified. The 0.1.4 APK still uses legacy PeerJS slots. See [MULTIPLAYER.md](MULTIPLAYER.md). The queue client is bundled but inactive; rebuild with the verified shared API URL after deployment. No real two-device queue result is claimed.

## Build on this ARM64 phone

Node 22+, Java 21, Android SDK 36 and build-tools 35.0.0 (AGP default; 36.0.0 is also installed locally) are required. Do not replace the shared SDK or remove the ARM aapt2 override in `android/gradle.properties`. The old shared ARM binary cannot read SDK 36 resources. The build script verifies/downloads a newer project-local ARM aapt2 from lzhiyong/android-sdk-tools 35.0.2, pinned by SHA-256; the original shared binary is untouched. Gradle is project-local, one worker, with a 1 GB heap. No emulator, NDK or Android Studio is required for this command-line build.

```
npm ci --cache .git/npm-cache
mkdir -p .android-tools/sdk/licenses .android-tools/home .android-tools/tmp
cp /root/projects/android-sdk/licenses/* .android-tools/sdk/licenses/
ANDROID_USER_HOME="$PWD/.android-tools/home" JAVA_TOOL_OPTIONS="-Duser.home=$PWD/.android-tools/home" /root/projects/android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root="$PWD/.android-tools/sdk" 'platforms;android-36' 'build-tools;35.0.0'
printf 'sdk.dir=%s/.android-tools/sdk\n' "$PWD" > android/local.properties
npm --cache .git/npm-cache run build:android
```

Output: `artifacts/FingerFight-debug.apk`. Package: `io.github.ppatsis.fingerfight.debug`. Keep `.android-tools/debug.keystore` to update the same installed debug app; it is deliberately ignored by Git. This is a debug prototype, not a signed Play release. On another host set its own SDK path and override `android.aapt2FromMavenOverride` with that host's executable.

The packager copies the service-worker shell allowlist and the five existing music tracks, bundles pinned MediaPipe 0.10.14 and the checksum-verified existing model, disables service workers in the native copy, and adapts safe-area CSS to Capacitor SystemBars. It never copies backend files. Android loads bundled assets from secure `https://localhost`; it does not load the Pages site remotely. Browser files are unchanged. Android updates require a new APK, later Play updates.

Camera permission is requested when camera use starts. No microphone permission. Backgrounding releases the existing camera; resuming nudges reconnect but does not silently restart it. Back uses existing leave confirmation/history, and exits at the menu. Local app data is separate from browser/PWA data. Existing passkey configuration is for the website origin; native accounts require a separate tested Credential Manager/Digital Asset Links integration before enabling them.

## Real phone acceptance checks (must not be inferred from a successful build)

- Install and cold start offline; menu, store and computer practice should load. First camera use should not download a model.
- Allow/deny/revoke camera; check front/back selection, try-on and two-hand finger counts, and failure/retry messages.
- Check notch/status/navigation bar spacing, keyboard, narrow-screen sliders and hardware Back/leave confirmation.
- Use two phones for a complete private match, reconnect after background/Wi-Fi changes, results, customisation and rematch. Check result-image saving/sharing and screen-awake behaviour too; WebView support can differ from Chrome.
- Check camera indicator goes off in background, then explicitly restart camera. Confirm no tracking loop survives closing try-on.
- Compare sustained FPS/detect/draw timings against Chrome with the same skin and lighting; review fire, sand, Ghost/Chameleon and elemental effects. Check fist charge/release with one/two fingers, thumb-only, hand loss and reduced-motion; review compact viewer controls and sticky carousels. No FPS gain or parity is claimed until measured.

Play preparation later: release signing, store listing, privacy/data-safety disclosures, age/content assessment and the account's required testing track. No Play upload or backend deployment is part of this build.

Official references: [Capacitor overview](https://capacitorjs.com/docs), [Android](https://capacitorjs.com/docs/android), [v8 requirements](https://capacitorjs.com/docs/updating/8-0). Dependencies are pinned in package-lock.json. `npm test` includes native configuration/lifecycle checks; `node tools/android-check.mjs` checks generated assets after packaging.
