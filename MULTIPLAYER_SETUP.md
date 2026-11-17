# Multiplayer rollout — current checklist

The guarded common backend is enabled. Website/APK 0.1.9 use the same guest queue and managed TURN credentials. Do not retire the old ExpressTURN credentials until the owner accepts updated physical clients.

## Account/social update

Optional accounts, friends, linked private invites and confirmed friend rankings are enabled in the 0.2.0 client update. The server recomputes terminal transcripts and requires both players' agreement rather than trusting uploaded win totals. Browser sign-in and the Android PKCE handoff passed deployed software-authenticator tests; actual OS prompts still need review. Web Push keys are configured, permission is only requested on explicit opt-in, and native FCM remains unavailable until owner Firebase configuration is supplied. See PUSH_SETUP.md. No new Cloudflare token or paid Workers upgrade is needed.

## Verified

- Scoped project-local Cloudflare CLI login, Worker fingerfight-api and D1 fingerfight-prod; no paid Workers upgrade.
- Both runtime secrets attached and validated. Neither permanent secret enters the app/repository/logs.
- Live HTTPS/origin/auth guards, real D1 pairing, both-player acknowledgement, cancellation and temporary guest cleanup.
- Real bidirectional relay payloads over UDP/3478 and TLS/443. These are protocol checks, not a physical WebRTC game.
- Scheduled usage monitor updated D1 without another client request. Synthetic high-water cutoff blocks new issuance and stays stopped despite a lower delayed total.
- Limits: 800 GB account-wide TURN high-water guard, 1,000 credential issuances per configured period, 20 requested-lifetime reservations, per-IP/user rates. Unknown analytics, invalid/stale dates and missing secrets fail closed.
- Initial period November 13 inclusive to December 13 exclusive; owner confirmed Realtime renews December 13. No automatic rollover. Next window must be deliberately configured before this one expires.
- Game 413/413 and backend 32/32 tests pass. APK 0.1.9/code 10 built, signature/content/source checked; Downloads delivery copy checked separately.

## What the expiry tests mean

A credential still connected 20–31 seconds after requested expiry; revocation acknowledgement did not promptly prevent a fresh allocation. This is not evidence of continued billing. Cloudflare explicitly documents billing/analytics cessation before delayed disconnect. The earlier demand for a support case was premature and is withdrawn. No support case or new token is required for this pilot. Raw observations and an optional question remain in backend/TURN_PROVIDER_CHECK.md.

The guard is protective admission control, not a provider-enforced invoice ceiling. Delayed analytics, in-flight traffic and other shared-allowance Realtime products can affect costs. Do not claim guaranteed $0 or immediate traffic shutdown.

## Owner acceptance after delivery

1. Install Downloads/FingerFight-0.1.9-debug.apk and use the updated website on the laptop. Old APKs use the old random queue.
2. Test phone ↔ laptop/phone across Wi-Fi/mobile data: Ready, a match exceeding ten minutes, background/reconnect, forfeit and rematch. Report actual results; software tests do not replace them.
3. Retire the old ExpressTURN credentials only after replacement clients work. This may break old APK connectivity.

## Later production work

- Measure actual player capacity against Workers/D1 free quotas and tune polling/limits before widening the pilot.
- Add bot-resistant credential admission and establish moderation/privacy/account deletion requirements before enabling account/friends features or a wider public launch.
- Review the next accounting period before December 13; keep this account's shared Realtime allowance dedicated to this game during the pilot.

Account two-factor authentication and billing alerts are optional owner safeguards, not prerequisites. Alerts do not stop traffic; Spend limits Beta currently does not cover TURN. No further subscription purchase or token setup is required.
