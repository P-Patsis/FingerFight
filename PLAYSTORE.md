# Finger Fight — Google Play release preparation

The debug APK remains the phone-testing build. A Play release uses `io.github.ppatsis.fingerfight` (without `.debug`) and an Android App Bundle. Release builds disable the prototype Store-reset controls. No app has been uploaded to Play and the guarded Worker/D1/TURN multiplayer pilot is enabled for APK 0.1.9 and the website.

## Verified build (2026-11-12)

Release `bundleRelease` succeeds in 6m01s. Bundle inspection confirms model/music/native runtime, disabled developer tools, private-file exclusion and unsigned state. The AAB is 17,345,250 bytes; SHA-256 `ba19760a3f4947b02950537b4f9b0afa9a1690b782749e187970c5de1cd56a99`. Game suite: 409/409 pass. Upload-key signing remains untested because no owner key is configured; Play Console validation/physical installation are not claimed. Current debug APK 0.1.9 is separately built, signature-verified and delivered to phone Downloads. The older unsigned AAB above predates the latest multiplayer release and must be rebuilt/signed before upload.

## Prepared in this repository

- `npm run build:android`: existing debug APK, same debug package/key, developer Store reset available.
- `npm run build:android:bundle`: release AAB, local tracking/model/music, secure native origin, developer controls disabled. No signing inputs produces `artifacts/FingerFight-release-unsigned.aab`. This is a review artifact, not an uploadable or directly installable app.
- For an upload-signed bundle, configure all four environment variables through your local secret manager or CI: `FF_UPLOAD_KEYSTORE` (absolute private keystore path), `FF_UPLOAD_STORE_PASSWORD`, `FF_UPLOAD_ALIAS`, `FF_UPLOAD_KEY_PASSWORD`. Then run the same bundle command; output is `artifacts/FingerFight-release.aab`. Partial configuration fails. No debug-key fallback. Never commit a keystore/password or paste them into chat. Keep a private backup of the upload key.
- Actual bundle inspection checks model/music, native runtime, disabled developer controls, private-file exclusion and upload signature when configured. Google Play validation and installation from an internal track remain separate checks.

Google requires upload-key signing for an AAB; Play App Signing signs the APKs distributed to users. See [Android signing](https://developer.android.com/studio/publish/app-signing) and [uploading bundles](https://developer.android.com/studio/publish/upload-bundle).

## Multiplayer before a public launch

Updated Android 0.1.9 and website players use the enabled Cloudflare Worker/D1 guest queue, PeerJS signaling and encrypted WebRTC gameplay. Random matches force managed Cloudflare TURN to hide peer IPs; private matches allow direct connections with managed relay fallback. Permanent provider secrets no longer ship in updated clients.

Verified: HTTPS/CORS/auth, live guest pairing/two-player acknowledgement/cancellation, actual bidirectional UDP/TLS relay, scheduled monitoring, synthetic usage cutoff and live credential-cap admission. Current guards are 800 GB high-water, 1,000 credential issuances per initial Nov 13–Dec 13 accounting window, 20 requested-lifetime reservations and IP/user rates. Unknown usage and stale windows refuse issuance. The guard is not a provider-enforced dollar ceiling; automatic period rollover is disabled. No paid Workers upgrade was selected. See MULTIPLAYER_SETUP.md for remaining acceptance and accounting review.

Before wider distribution, test physical crossplay and credential renewal in a >10-minute game, background/reconnect, Ready, forfeit and rematch; measure bandwidth/capacity and strengthen bot admission. Review public PeerJS signaling availability. Retire the old public ExpressTURN credentials only after updated clients work. Cloudflare documents an included TURN allowance and usage pricing: https://developers.cloudflare.com/realtime/turn/faq/.

Accounts remain optional for guest matching. The 0.2.0 update enables website/Android passkey accounts, friends and confirmed friend rankings. Native authentication uses the browser plus a one-use PKCE grant. Browser push is configured; Android background FCM needs owner project configuration (PUSH_SETUP.md). Report/block APIs exist; an operational moderation owner/workflow is still required for a public social release. Ads and the proposed one-time unlock-all purchase are unconfigured; no fake rewards/checkout. Keep monetisation out of the first test release until actual products, receipt/reward verification and restoration are implemented.

## Items the owner must provide or complete

- Google Play developer account and identity verification; confirm the permanent package identity before the first upload.
- Private upload key (or authorise creating a project-local key and keep its backup); enable Play App Signing in Console.
- Public developer/support contact and privacy-policy URL. Finalise Data safety, content rating, target audience, screenshots, icon and store listing based on the actual release configuration. Do not claim that private-match photos never leave the device: random matches exclude photos, while private matches can send an explicitly selected camera snapshot to the peer.
- Privacy inventory to review: local camera inference; name/country/look/preferences/stats kept on device; PeerJS signaling metadata and TURN relay traffic; optional private peer photos; and, the enabled backend's guest sessions/queue metadata plus any enabled friend/account/report records. Define provider disclosures and retention before publishing. No advertising SDK is added and Firebase analytics collection/auto-registration default off. Optional push stores device subscriptions or FCM tokens; account data now includes accepted friendships, invitations and confirmed match results. Account deletion is available in Account & friends and via https://p-patsis.github.io/FingerFight/#account after passkey sign-in; verify the physical browser/native flow before listing. [Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
- Testers and device acceptance results. For personal developer accounts created after 13 November 2023, the currently documented production-access prerequisite is at least 12 continuously opted-in closed testers for 14 days. Confirm the account-specific requirement in Console. [Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

Internal testing is the next distribution step after signing and the required Console declarations. An unsigned build or passing unit tests does not establish Play approval, camera performance, multiplayer capacity or physical-device correctness.
