# Finger Fight — Google Play release preparation

The debug APK remains the phone-testing build. A Play release uses `io.github.ppatsis.fingerfight` (without `.debug`) and an Android App Bundle. Release builds disable the prototype Store-reset controls. No app has been uploaded to Play and no production backend has been activated.

## Verified build (2026-11-12)

Release `bundleRelease` succeeds in 6m01s. Bundle inspection confirms model/music/native runtime, disabled developer tools, private-file exclusion and unsigned state. The AAB is 17,345,250 bytes; SHA-256 `ba19760a3f4947b02950537b4f9b0afa9a1690b782749e187970c5de1cd56a99`. Game suite: 409/409 pass. Upload-key signing remains untested because no owner key is configured; Play Console validation/physical installation are not claimed. Debug APK 0.1.8 is separately built, signature-verified and delivered to phone Downloads.

## Prepared in this repository

- `npm run build:android`: existing debug APK, same debug package/key, developer Store reset available.
- `npm run build:android:bundle`: release AAB, local tracking/model/music, secure native origin, developer controls disabled. No signing inputs produces `artifacts/FingerFight-release-unsigned.aab`. This is a review artifact, not an uploadable or directly installable app.
- For an upload-signed bundle, configure all four environment variables through your local secret manager or CI: `FF_UPLOAD_KEYSTORE` (absolute private keystore path), `FF_UPLOAD_STORE_PASSWORD`, `FF_UPLOAD_ALIAS`, `FF_UPLOAD_KEY_PASSWORD`. Then run the same bundle command; output is `artifacts/FingerFight-release.aab`. Partial configuration fails. No debug-key fallback. Never commit a keystore/password or paste them into chat. Keep a private backup of the upload key.
- Actual bundle inspection checks model/music, native runtime, disabled developer controls, private-file exclusion and upload signature when configured. Google Play validation and installation from an internal track remain separate checks.

Google requires upload-key signing for an AAB; Play App Signing signs the APKs distributed to users. See [Android signing](https://developer.android.com/studio/publish/app-signing) and [uploading bundles](https://developer.android.com/studio/publish/upload-bundle).

## Multiplayer before a public launch

Current Android and website players share PeerJS signaling and WebRTC gameplay. Random matches require TURN to hide peer IPs. The legacy queue has eight rendezvous slots and ships a reusable public ExpressTURN credential. The user reported phone/laptop matching worked; this is not a public-capacity or service-availability guarantee.

The replacement Worker/D1 shared queue and authenticated TURN credential endpoint already exist and have 19 passing backend tests. `API_URL` remains empty. Account access was previously rejected; renewed access/deployment permission has been requested before touching that account. Activation needs:

1. Dedicated Worker/D1 deployment, configured allowed origins (`https://p-patsis.github.io`, `https://localhost`), authentication, quotas and cleanup.
2. TURN provider key/API token stored as Worker secrets. Existing Cloudflare implementation issues credentials valid for 3600 seconds and advertises refresh after 3300 seconds. Only temporary credentials reach clients; the provider API token never does. [Cloudflare credential generation](https://developers.cloudflare.com/realtime/turn/generate-credentials/).
3. Verify real HTTPS queue registration/pairing/acknowledgement/cancellation/expiry and actual relay connectivity. Set the verified common API_URL, restamp the website and rebuild Android. Both clients must update; server-queue clients do not share the old slots.
4. Enable the prepared 800 GB protective TURN cutoff only after real analytics and revocation checks. Configure billing-period dates, Account Analytics secret and one-minute monitoring as described in backend/README.md. Issuance defaults off; a failed/missing usage check refuses access. This is not a provider-enforced dollar cap and does not cover other cloud services.
5. Review signaling ownership/availability for public traffic. The shared queue is matchmaking, not a PeerJS signaling replacement. The current public PeerJS Cloud is still used; dedicated PeerServer hosting is a separate production option ([PeerServer guide](https://peerjs.com/server/getting-started)).
6. Test real Android/browser crossplay over Wi-Fi and mobile data, both-player Ready, tab/app backgrounding, bounded deadlines, reconnect, forfeit and rematches. Review actual relay traffic, quotas and abuse controls before opening distribution.
7. Retire/rotate the old public ExpressTURN credentials after updated clients use the new relay. Rotating them alone simply republishes another long-lived credential and can break old APKs. Rotation of the private provider API token is a server-side operation; do not put it in ice.js.

Cloudflare documents a TURN free allowance, but usage beyond it can incur charges. Review account billing/limits before activation; no paid plan or spending commitment has been made. [Realtime FAQ](https://developers.cloudflare.com/realtime/turn/faq/).

Accounts are optional for guest matching. Native passkey account UI and verified leaderboards remain disabled pending their separate integrations. Report/block APIs exist; an operational moderation owner/workflow is still required for a public social release. Ads and the proposed one-time unlock-all purchase are unconfigured; no fake rewards/checkout. Keep monetisation out of the first test release until actual products, receipt/reward verification and restoration are implemented.

## Items the owner must provide or complete

- Google Play developer account and identity verification; confirm the permanent package identity before the first upload.
- Private upload key (or authorise creating a project-local key and keep its backup); enable Play App Signing in Console.
- Public developer/support contact and privacy-policy URL. Finalise Data safety, content rating, target audience, screenshots, icon and store listing based on the actual release configuration. Do not claim that private-match photos never leave the device: random matches exclude photos, while private matches can send an explicitly selected camera snapshot to the peer.
- Privacy inventory to review: local camera inference; name/country/look/preferences/stats kept on device; PeerJS signaling metadata and TURN relay traffic; optional private peer photos; and, if the backend is activated, guest sessions/queue metadata plus any enabled friend/account/report records. Define provider disclosures and retention before publishing. No analytics/ad SDK is currently added. If accounts are enabled, provide working in-app and web account-deletion routes. [Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
- Testers and device acceptance results. For personal developer accounts created after 13 November 2023, the currently documented production-access prerequisite is at least 12 continuously opted-in closed testers for 14 days. Confirm the account-specific requirement in Console. [Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

Internal testing is the next distribution step after signing and the required Console declarations. An unsigned build or passing unit tests does not establish Play approval, camera performance, multiplayer capacity or physical-device correctness.
