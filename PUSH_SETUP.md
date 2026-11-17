# Invite notifications — current setup

Accounts and friends work independently of notifications. Browser/PWA Web Push is configured on the Worker. Users explicitly enable it in Account & friends. Android background delivery is implemented but unavailable until an owner Firebase project is configured; there is no fake foreground-polling substitute.

## Owner Firebase step

Owner selected project **fingerfight-830b2**: https://console.firebase.google.com/project/fingerfight-830b2/overview . Android app configuration and sender credential are still pending. Cloud Messaging itself is a no-cost Firebase service; a paid Workers upgrade is not needed. Google Analytics is not needed for invite delivery and is disabled in this app.

Register an Android app with package **io.github.ppatsis.fingerfight.debug** for the current testing APK. Download its **google-services.json**. Before a Play release, also register **io.github.ppatsis.fingerfight** in the same project and include that client configuration. These are application configuration files, not the server's private key.

For sending, create a dedicated service account with the **Firebase Cloud Messaging API Admin** role in that project, ensure the FCM HTTP v1 API is enabled, and create/download its JSON key. This is a permanent private credential. Do not paste it in chat or commit it. The account owner must perform Google account/project approval; the agent cannot infer an existing Firebase project from Cloudflare access.

Tell the agent the project ID and the exact downloaded filenames. The terminal shares this phone's Downloads folder, so named files can be read directly without pasting credentials. After the private sender key is safely stored as a Worker secret, remove the shared-Downloads copy yourself; keep a private backup if needed.

## Operator configuration

`node tools/configure-fcm.mjs <google-services.json path> <service-account.json path>` validates that both belong to the same project, requires the debug app client, checks the RSA key, obtains a scoped OAuth token, and performs an FCM **validate-only** request (no notification sent). It then copies app configuration into the ignored Android path and stores the sender JSON in encrypted Worker secret **FCM_SERVICE_ACCOUNT**. It never logs credentials and refuses silently switching an already configured project.

Refresh the existing project Cloudflare CLI login first if necessary (`bash tools/cf.sh auth whoami`; do not print its credential file). Rebuild/deliver Android after configuration: its package flag is generated from the presence of the local Google configuration. A server secret alone does not configure an installed APK.

## Acceptance

- Sign in, enable invite notifications and grant OS/browser permission. No permission should be requested merely by launching the game or creating an account.
- An accepted friend sends an invite; check foreground and closed-app delivery. No private room code or bearer token is in the push.
- A tap opens the inbox; joining still requires the user to tap Join and the private host to accept.
- Disable notifications and check delivery stops. Sign out/delete and check subscriptions are removed. Offline disable is retried with a device-scoped revoke key, not an old account bearer.
- Block/remove the friend and check queued/expired invitations are not delivered.

Physical permission prompts and receipt cannot be inferred from a compiled APK or mocked push-service test.

References: https://firebase.google.com/products/cloud-messaging ; https://firebase.google.com/docs/cloud-messaging/send/v1-api ; https://firebase.google.com/docs/cloud-messaging/android/get-started ; https://capacitorjs.com/docs/apis/push-notifications
