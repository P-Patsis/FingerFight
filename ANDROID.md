# Android prototype

## Accounts/social update — 0.2.0, code 11

The new build adds optional passkey sign-in, accepted friends, linked invitations, mutually confirmed friend rankings and per-device notification controls. Native passkeys use the system browser and a one-use PKCE-bound return grant. Guest play remains available. Website push is configured; native background push requires the owner Firebase configuration described in [PUSH_SETUP.md](PUSH_SETUP.md). The FCM SDK defaults to no auto-registration/analytics collection, and availability is gated on both packaged and server configuration. OS delivery and native passkey prompts still need physical-device acceptance.


Final APK 0.2.0/code 11 builds in 3m56s; package/version, bundled source/plugins/model/music and Android v2 signature verify. Delivered to phone Downloads/FingerFight-0.2.0-debug.apk, 21,388,118 bytes, SHA-256 `8a50cce5de99d6774b350aba93af954763cd821a8d29c9846aada5a541cd5501`; Downloads checksum matches.

Capacitor 8 packages the game and its hand-tracking model locally in Android System WebView. It is separate from Cloudflare, which now runs the shared guest matchmaking API and TURN relay. The APK does not load the game from GitHub Pages; it shares the same backend with website players.

Previous delivered debug APK: version code 10 / `0.1.9-prototype`, in phone Downloads as `FingerFight-0.1.9-debug.apk`. Build, v2 signature, package contents, model/music and networking source checks pass. Size 19,652,553 bytes; SHA-256 `bd8f7448ee38d498f74ca22ad0cf86f95fc2396a42b5911cae53ee317f18515b`. Game tests 413/413, backend tests 32/32. Physical-device WebRTC/camera/FPS acceptance remains open.

The common API is enabled at https://fingerfight-api.fingerfight-ppatsis.workers.dev. Updated Android and website players share one random queue. Old APKs use the previous queue. Server-issued TURN credentials request a ten-minute TTL and refresh through explicit ICE renewal; permanent provider secrets remain on the server. See [MULTIPLAYER.md](MULTIPLAYER.md) and [MULTIPLAYER_SETUP.md](MULTIPLAYER_SETUP.md) for verified guards and limits.

## Play Store preparation

See [PLAYSTORE.md](PLAYSTORE.md) for the release AAB build, private upload signing inputs, disabled developer controls, backend/TURN activation and owner-supplied Console requirements. The release AAB build succeeded in 6m01s; actual bundle contents and disabled developer controls verify. Unsigned artifact: artifacts/FingerFight-release-unsigned.aab (17,345,250 bytes; SHA-256 `ba19760a3f4947b02950537b4f9b0afa9a1690b782749e187970c5de1cd56a99`). It is a build-review artifact, not a Play submission. No private upload key/account was supplied and no Play Console upload was attempted.

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

Camera permission is requested when camera use starts. No microphone permission. Backgrounding releases the existing camera; resuming nudges reconnect but does not silently restart it. Back uses existing leave confirmation/history, and exits at the menu. Local app data is separate from browser/PWA data. Existing passkey configuration is for the website origin; native accounts now use the hosted browser passkey/PKCE flow rather than claiming an unimplemented native Credential Manager/Digital Asset Links integration.

## Real phone acceptance checks (must not be inferred from a successful build)

- Install and cold start offline; menu, store and computer practice should load. First camera use should not download a model.
- Allow/deny/revoke camera; check front/back selection, try-on and two-hand finger counts, and failure/retry messages.
- Check notch/status/navigation bar spacing, keyboard, narrow-screen sliders and hardware Back/leave confirmation.
- Use two phones for a complete private match, reconnect after background/Wi-Fi changes, results, customisation and rematch. Check result-image saving/sharing and screen-awake behaviour too; WebView support can differ from Chrome.
- Check camera indicator goes off in background, then explicitly restart camera. Confirm no tracking loop survives closing try-on.
- Compare sustained FPS/detect/draw timings against Chrome with the same skin and lighting; review fire, sand, Ghost/Chameleon and elemental effects. Check fist charge/release with one/two fingers, thumb-only, hand loss and reduced-motion; review compact viewer controls and sticky carousels. No FPS gain or parity is claimed until measured.

Play preparation later: release signing, store listing, privacy/data-safety disclosures, age/content assessment and the account's required testing track. No Play upload has been made; backend pilot deployment is complete.

Official references: [Capacitor overview](https://capacitorjs.com/docs), [Android](https://capacitorjs.com/docs/android), [v8 requirements](https://capacitorjs.com/docs/updating/8-0). Dependencies are pinned in package-lock.json. `npm test` includes native configuration/lifecycle checks; `node tools/android-check.mjs` checks generated assets after packaging.
