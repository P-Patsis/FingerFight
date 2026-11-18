# Android prototype

## Friends update — 0.2.5, code 16

Adds device friends without mandatory sign-in, Add friend in lobby/game menu/results, invitations into the current private room, automatic Profile name saving and an invitation-notification On/Off switch. Google sign-in code is packaged but remains hidden pending public OAuth client setup; passkeys remain optional. Startup/launcher rotation unchanged. Physical friend flow and notification delivery need phone acceptance.

- APK 0.2.5/code 16 built successfully (final Gradle build 3m04s). Actual package/version, bundled current HTML/CSS/JS including both new friend modules, Firebase push capability, native plugins and v2 signature verified; signing certificate matches 0.2.4. Delivered Downloads/FingerFight-0.2.5-debug.apk: 21,681,759 bytes, SHA-256 `316e0983d746de72142a4d7d2cf09cadc39f809fbb902962f0076db57c4a3c9b`; copied checksum matches. Phone layout/notification receipt and real Google browser acceptance remain pending.

## Startup puppet and app name — 0.2.4, code 15

Removed the separate old splash drawable reference. API 24–30 uses a new puppet + FINGER FIGHT vector mark; API 31+ leaves the icon to Android's launching activity/alias resolution and adds a native 200×80dp FINGER FIGHT branding image. API 33+ prefers displaying the icon. Direct activity entry uses the app puppet fallback. No added startup delay, loading overlay, extra activity or dependency. Hourly icon rotation is unchanged.

APK 0.2.4/code 15 built in 3m25s. Actual bundled source, startup artwork, API-qualified compiled theme parent chains/null overrides/branding/icon preference, existing 48 icon variants and v2 update signature verify. Downloads/FingerFight-0.2.4-debug.apk: 21,673,549 bytes; SHA-256 `1789549dfbc7417001de7432fdd6c95a23ea72bc6e5ebe5c0679988e5c7fd4f9`; copied checksum matches. Generator output is byte-for-byte idempotent.

Focused lifecycle/theme/launcher/notification tests: 12/12 pass. Reviewed artifacts/startup-review.png from generated paths; actual cold-start appearance still needs phone review. Regenerate with `node tools/startup-art.mjs` after regenerating launcher artwork, and `python3 tools/raster_review.py artifacts/startup-review.svg` for the contact-sheet PNG.

## Rotating puppet icons — 0.2.3, code 14

48 packaged native icon variants reuse the existing rig: 8 skins × 0–5 fingers. Both skin and count change on each selection. Open the app once, then return home to schedule the first random selection. A persisted JobScheduler job targets an hourly cycle with 15-minute flex; Android battery management and launcher caching can delay updates. Visible play defers the change until a due background catch-up. Force-stop pauses jobs until the app is reopened. No network/camera work or new dependency is involved in rotation.

The real MainActivity/deep-link target stays enabled. API 33+ component changes are atomic; older versions enable the new alias before disabling the old one. Jobs are serialized to avoid duplicate entries when periodic and catch-up runs overlap. New-APK notifications use a stable OPEN_INVITES activity action after capability refresh; old APK notifications keep their existing routing. All private server bindings were preserved.

Final APK 0.2.3/code 14 built in 3m22s; actual bundled source, all 144 legacy/adaptive/foreground resources, 48 compiled aliases with one default, native classes and synchronized rotation, Firebase flag and v2 update signature verify. Downloads/FingerFight-0.2.3-debug.apk: 21,673,153 bytes, SHA-256 `999d0490c4326f930d4662d7f6a7308e45e0a5cf9ff5ea94e1c1e2ebbc2eeefb`; copied checksum matches.

Verified: 431/431 client/game and 44/44 backend tests, plus 3/3 final JVM/manifest/geometry checks. Reviewed artifacts/launcher-icons-review.png from the actual rig; native curves retain full precision. Phone launcher masks, themed icons, cache refresh, home shortcut retention, icon rotation over time, notification taps after a rotation, passkey return and match survival remain physical acceptance checks.

Regenerate assets with `node tools/launcher-icons.mjs`; then `python3 tools/raster_review.py artifacts/launcher-icons-review.svg` regenerates the reviewed PNG. Resource/manifest/catalog generation is byte-for-byte idempotent. Keep alias names stable across upgrades.

## Account/multiplayer transport hotfix — 0.2.2, code 13

Fixes the browser/WebView fetch receiver error that blocked passkey signup, private rooms and random matching. Account & friends has an opaque dark background, and Hide rude gestures has no parenthetical explanation. Full tests: 427/427 game/client, 43/43 backend. The controller tests now exercise real Service requests with browser receiver checks rather than replacing the method.

APK 0.2.2/code 13 built in 3m33s. Actual packaged Service, account contrast CSS, shortened label, Firebase flag, assets and v2 signature verify; same update certificate as 0.2.1. Delivered Downloads/FingerFight-0.2.2-debug.apk, 21,339,049 bytes, SHA-256 `b5a9df9d32ebb7a6923e23108c7c858390cdf0367becaafc2814a7f18961f9a3`; copied checksum matches.

Website implementation a7da37b is published and all 19 checked files match. Phone UI, passkey prompts, real matches and notification delivery still need device acceptance.

## Native invite notifications — 0.2.1, code 12

Firebase Android configuration for project `fingerfight-830b2` is included locally, and the live API recognises its encrypted sender configuration. This build enables native invitation-notification opt-in in Account & friends. Permission is requested only after the user enables it. The private service-account key stays server-side.

APK 0.2.1/code 12 built in 3m45s. Actual APK contents, packaged native-push flag, Firebase project/app/sender resources, merged permissions/auto-init defaults and Android v2 signature verify; certificate matches 0.2.0. Delivered to phone Downloads/FingerFight-0.2.1-debug.apk, 21,339,029 bytes, SHA-256 `205be539589e6efc429b1d99fe5d06c32092fd9836f22dd96ba2308a65b89193`; Downloads checksum matches. Google sender authorisation and actual foreground/background receipt still require physical invitation acceptance tests.

The previous 0.2.0 APK does not contain this Firebase configuration.

## Accounts/social update — 0.2.0, code 11

This earlier build added optional passkey sign-in, accepted friends, linked invitations, mutually confirmed friend rankings and per-device notification controls. Native passkeys use the system browser and a one-use PKCE-bound return grant. Guest play remains available. Website push is configured; native background push requires the owner Firebase configuration described in [PUSH_SETUP.md](PUSH_SETUP.md). The FCM SDK defaults to no auto-registration/analytics collection, and availability is gated on both packaged and server configuration. OS delivery and native passkey prompts still need physical-device acceptance.


Final APK 0.2.0/code 11 builds in 3m22s; package/version, bundled source/plugins/model/music and Android v2 signature verify. Delivered to phone Downloads/FingerFight-0.2.0-debug.apk, 21,388,118 bytes, SHA-256 `c55c16dc58090c38025e927ea12f7ffefc98af1bbc2baea5cae24e6b189324a1`; Downloads checksum matches.

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
