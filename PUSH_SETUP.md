# Invite notifications — current setup

Accounts and friends work independently of notifications. Browser/PWA Web Push is configured on the Worker. Users explicitly enable it in Account & friends. Android Firebase configuration is now recognised by the live Worker. Configured APK 0.2.3/code 14 is delivered in phone Downloads; physical delivery acceptance is pending; foreground polling is not used as a substitute for background push.

## Owner Firebase step

Owner selected project **fingerfight-830b2**: https://console.firebase.google.com/project/fingerfight-830b2/overview . Android testing app configuration is validated and saved locally in the ignored build path. Owner deployed the sender credential directly as encrypted Worker secret `FCM_SERVICE_ACCOUNT`; live authenticated configuration reports Android push ready. Google sender authorisation and device delivery are not proved by that flag. Configured APK 0.2.3/code 14 has been built, packaged-resource/signature/source verified and copied with matching checksum to phone Downloads. Cloud Messaging itself is a no-cost Firebase service; a paid Workers upgrade is not needed. Google Analytics is not needed for invite delivery and is disabled in this app.

Register an Android app with package **io.github.ppatsis.fingerfight.debug** for the current testing APK. Download its **google-services.json**. Before a Play release, also register **io.github.ppatsis.fingerfight** in the same project and include that client configuration. These are application configuration files, not the server's private key.

For sending, create a dedicated service account with the **Firebase Cloud Messaging API Admin** role in that project, ensure the FCM HTTP v1 API is enabled, and create/download its JSON key. This is a permanent private credential. Do not paste it in chat or commit it. The account owner must perform Google account/project approval; the agent cannot infer an existing Firebase project from Cloudflare access.

Tell the agent the project ID and the exact downloaded filenames. The terminal shares this phone's Downloads folder, so named files can be read directly without pasting credentials. After the private sender key is safely stored as a Worker secret, remove the shared-Downloads copy yourself; keep a private backup if needed.

## Dashboard transfer when Android blocks Downloads reads

Owner reports `fingerfight-invite-sender` service account created with the requested messaging role. Owner has deployed its credential directly into the encrypted Worker secret. Verify sending access during physical acceptance.

Use Google Cloud IAM service accounts for project `fingerfight-830b2`, open the sender account, Keys → Add key → Create new key → JSON. Keep that private file out of chat. Open it on the phone and copy its entire JSON into Cloudflare Worker `fingerfight-api` → Settings → Variables and Secrets → Add, type Secret, name `FCM_SERVICE_ACCOUNT`, then deploy. Existing TURN secrets stay unchanged. Ensure the Firebase Cloud Messaging API is enabled in that Google project. This transfers the sender directly into encrypted server storage without requiring Termux to read the shared download. Do not claim sender authentication or device delivery verified merely because the secret exists. The configured Android build is delivered; complete physical permission/token/invite delivery acceptance next.

## Operator configuration

`node tools/configure-fcm.mjs <google-services.json path> <service-account.json path>` validates that both belong to the same project, requires the debug app client, checks the RSA key, obtains a scoped OAuth token, and performs an FCM **validate-only** request (no notification sent). It then copies app configuration into the ignored Android path and stores the sender JSON in encrypted Worker secret **FCM_SERVICE_ACCOUNT**. It never logs credentials and refuses silently switching an already configured project.

Refresh the existing project Cloudflare CLI login first if necessary (`bash tools/cf.sh auth whoami`; do not print its credential file). Rebuild/deliver Android after configuration: its package flag is generated from the presence of the local Google configuration. A server secret alone does not configure an installed APK.

## Acceptance

APK 0.2.3 advertises validated `launcherSafe` support and uses a stable activity click action so icon aliases can rotate without invalidating new notification taps. Prior opt-ins refresh silently on native readiness; older APKs keep the legacy route. Include tapping an invitation after an icon change in device acceptance.

- Sign in, enable invite notifications and grant OS/browser permission. No permission should be requested merely by launching the game or creating an account.
- An accepted friend sends an invite; check foreground and closed-app delivery. No private room code or bearer token is in the push.
- A tap opens the inbox; joining still requires the user to tap Join and the private host to accept.
- Disable notifications and check delivery stops. Sign out/delete and check subscriptions are removed. Offline disable is retried with a device-scoped revoke key, not an old account bearer.
- Block/remove the friend and check queued/expired invitations are not delivered.

Physical permission prompts and receipt cannot be inferred from a compiled APK or mocked push-service test.

References: https://firebase.google.com/products/cloud-messaging ; https://firebase.google.com/docs/cloud-messaging/send/v1-api ; https://firebase.google.com/docs/cloud-messaging/android/get-started ; https://capacitorjs.com/docs/apis/push-notifications

## 0.2.5 device profiles

Notifications no longer require registering a passkey: a saved device profile can opt in from Friends → Invitation notifications (On/Off). Accepted friendship, invite expiry, blocks and device-scoped revocation still apply. Allow permission only when switching On; switching Off unregisters delivery. No permission prompt on launch. Clearing app data can lose an unlinked device identity; optional account linking provides recovery.

## Optional Google sign-in setup

The implemented GSI browser flow needs a public **Web application OAuth client ID**, not the TURN API token, FCM private sender key or Firebase API key. In Firebase project fingerfight-830b2, enable Authentication → Sign-in method → Google and select a support email. Obtain the associated Web client ID from Google Cloud → APIs & Services → Credentials. In that Web OAuth client, authorize JavaScript origin `https://fingerfight-api.fingerfight-ppatsis.workers.dev`. The current GSI callback flow does not need a redirect URI or client secret.

Set public Worker variable GOOGLE_CLIENT_ID to that client ID and also preserve it as a plain_text binding in backend/deploy.metadata.json for subsequent deployments. The client checks /auth/methods and hides Google while unconfigured. The API verifies fixed Google JWKS signatures, exact audience/issuer/nonce and expiry, then returns a short-lived one-use PKCE grant through the system browser/custom scheme (Android) or strict-origin popup message (web). No email/photo is retained. Google provider authorization and real browser sign-in still require owner acceptance; do not label Google active merely because code tests pass.

Before public Google rollout, check Google Auth Platform Branding/Audience for the correct Finger Fight app name, support email, homepage/privacy links and intended external audience. Test with a second Google account as well as the owner; do not confuse owner-only testing with public availability. Official setup reference: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid

## Google server configuration — 2026-11-18

The owner-supplied Web client ID is now configured as the public GOOGLE_CLIENT_ID binding and preserved in backend/deploy.metadata.json. APK 0.2.5 fetches this setting from the server, so this change needs no new APK. Keep the Web client secret in Google; this integration does not use it.

Remaining owner setting: https://console.cloud.google.com/apis/credentials?project=fingerfight-830b2 → select the matching Web OAuth client → Authorized JavaScript origins → add `https://fingerfight-api.fingerfight-ppatsis.workers.dev` → Save. Keep existing entries; no path or trailing slash. Live API availability/start/options can be verified independently, but do not claim real Google sign-in accepted until this origin is authorized and browser/phone acceptance succeeds.
