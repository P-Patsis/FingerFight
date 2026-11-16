# Multiplayer rollout — current checklist

The published website/APK still use the legacy matcher. The local frontend migration is unpublished. Do not retire ExpressTURN until replacement clients pass physical-device acceptance.

## Completed

- Restricted, project-local Cloudflare CLI login; credentials remain private in .git.
- Dedicated fingerfight-api Worker and fingerfight-prod D1; HTTPS, CORS/auth, pairing, acknowledgement and cancellation verified live.
- Both runtime secrets attached and tested: TURN_API_TOKEN mints credentials; TURN_USAGE_API_TOKEN reads account-wide TURN analytics.
- Real bidirectional TURN payloads verified over UDP/3478 and TLS/443. This is protocol evidence, not physical WebRTC/camera acceptance.
- Minute monitor and daily cleanup schedules registered. Synthetic usage cutoff blocks new credentials and stays stopped despite lower subsequent totals.
- Owner confirms Realtime renews December 13, 2026. Initial accounting window November 13 inclusive to December 13 exclusive; start inferred from service/account creation. No automatic rollover enabled.
- Workers Free retained. No paid Workers upgrade or new service required.

## Current blocker

Cloudflare's documented credential-revocation request returned 204 for a newly minted credential, but that credential still authenticated a new allocation 30 seconds later. A later request for a previously processed credential returned 404; 404 is not proof of successful revocation. An alternate body-based endpoint did not resolve the issue and was removed. Numeric HTTP status is audited in D1; only 204 marks revocation acknowledged. No further identical retry experiments planned.

The subsequent TTL-600 test also failed acceptance: data still relayed at 617 seconds and a fresh allocation succeeded at approximately 620 seconds. A wrong-password negative control was rejected. A separate TTL-60 comparison accepted both a previously used and a never-used credential at 91 seconds. Provider billing cessation has not been independently measured. Further identical expiry probes are stopped pending new evidence.

TURN_RELAY_ENABLED remains false. Shortened server-minted credential lifetime from 60 minutes to 10 minutes; client refresh begins before expiry. Default issuance quota remains 1,000 per configured window; it is a conservative pilot allowance, not a number of players or matches. The usage guard is 800 GB, account-wide TURN, below the advertised shared free allowance. Other Realtime products are not covered by this application's monitor.

Prepared app/network migration is backed up separately on `work/managed-multiplayer-20261116`; Pages serves `main`. The 0.1.9 APK build is verified but not delivered as an active multiplayer release.

## Remaining work

- Resolve provider revocation behavior (see backend/TURN_PROVIDER_CHECK.md), or explicitly accept a rollout based on tested expiry rather than prompt revocation. Do not claim a guaranteed $0 bill.
- Resolve failed real expiry acceptance and verify long-session WebRTC credential renewal on physical devices. Explicit host-coordinated ICE restart is implemented and mock-transport tests pass; real browser/device acceptance remains open.
- Enable common guest matchmaking backend only after safety checks; restamp/test/publish website and deliver matching APK. Keep unverified social/account UI disabled.
- Verify Pages source and APK packaging/signature/Downloads delivery.
- Owner tests updated phone ↔ laptop/phone across Wi-Fi/mobile data: Ready, a match exceeding ten minutes, background/reconnect, forfeit and rematch. Old APKs use the old random queue.
- Retire old ExpressTURN credentials only after replacement clients work; old APK connectivity may then break.
- Before a wider public launch: add bot-resistant credential admission, test capacity against Workers/D1 free quotas, and establish report handling/privacy/account deletion requirements for enabled features.

## Optional owner safeguards

- Enable Cloudflare account two-factor authentication and keep recovery codes private.
- Add an account billing email alert if available. An alert does not block traffic. Spend limits Beta currently supports Workers/Durable Objects, not TURN.
- Keep this account's Realtime allowance dedicated to the game during the pilot; other SFU/MoQ usage can consume the shared free allowance.

No further token, subscription purchase or payment step is currently required from the owner. Next owner action is physical-device acceptance after delivery, unless provider support needs account-owner involvement.
