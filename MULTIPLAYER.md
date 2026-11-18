# Multiplayer: Android and website

## What currently ships

The 0.2.0 update enables optional accounts and accepted friends on web/Android, friend invitations and server-recomputed, mutually confirmed match rankings. Notifications remain optional per device; browser Web Push is configured and Android FCM awaits owner configuration. See PUSH_SETUP.md. Guest matchmaking remains independent.

Android runs its bundled copy of the game in Capacitor, at `https://localhost`. It does not open or send gameplay to the GitHub website. Website players load that same game from GitHub Pages. Both use PeerJS's public `0.peerjs.com` service to introduce peers, then exchange encrypted WebRTC data-channel messages.

Private matches use a long random room code and allow direct connections, with TURN as a fallback. Random matches enforce TURN-only connections to hide the opponent's IP; updated clients receive temporary Cloudflare TURN credentials from the authenticated API. Provider secrets stay on the Worker. Old ExpressTURN credentials remain only for legacy clients until migration is accepted. Relay/network availability still affects whether a match connects.

APK 0.1.9 and the updated website share Cloudflare Worker/D1 guest matchmaking. The previous eight-slot random matcher is no longer used by updated clients. Old APKs do not randomly find new-queue players. Computer practice remains entirely local. New physical crossplay acceptance is still required; successful relay protocol and API tests are separate evidence.

## Ready controls and background deadlines (0.1.7)

Both P2P players press Ready after camera preparation. Editing cosmetics/view/rules cancels readiness; rematches return to the lobby. Computer matches keep their Start fight button. The in-game menu offers resume/forfeit without pausing the round.

Round timing uses absolute deadlines. Backgrounding locks the current hand before camera release; foregrounding catches up overdue callbacks. Validated phase/advance messages let the active peer drive progress when browser timers throttle. An unanswered round ends after a bounded 20-second wait. If both operating systems suspend the apps, no browser code executes until one resumes. Test Wi-Fi/mobile data, tab changes and native backgrounding on real devices; automated tests do not prove OS timing behavior.

## Shared server queue — enabled pilot

`backend/matchmaking.mjs` and `js/matchmaking.js` add one common queue for updated Android and website clients:

1. Get or reuse a guest session; an account is optional.
2. Obtain relay configuration from the authenticated API. Managed TURN credentials are short-lived; the provider API token stays on the Worker.
3. Request a unique opaque PeerJS ID, register it, then mark the ticket ready. Unregistered peers cannot be assigned.
4. Atomically claim two ready players in a D1 transaction. There is no fixed eight-slot limit. Account blocks are checked in both directions; each player has one ticket.
5. Both clients install the assigned peer identity and pairing secret before acknowledging. Only after both acknowledge does the guest dial the host.
6. Exchange existing validated game messages over WebRTC. Random matches still reject camera photos. The API receives identity/connection metadata, not camera frames.
7. Renew the connection lease every 20 seconds; cancel/reload/expired leases release the assignment. A late cancellation cannot remove a newer search. Existing peer reconnect secrets and grace periods still protect the seat. Relay refresh updates ICE configuration and coordinates a host-offered ICE restart over the existing authenticated data channel. Private rooms use the same managed relay as a fallback.

Waiting clients poll every two seconds and stop after two minutes. Initial assignment expires after 60 seconds, connected assignment after 120 seconds without renewal, and a waiting ticket after 90 seconds without polling. Cleanup runs on queue admission/readiness and through the scheduled handler. Limits remain finite: D1/Worker quotas, rate limits, signaling and relay capacity apply. The local concurrency test covers 40 clients/20 distinct pairs, not production load capacity.

A configured backend failure reports an error instead of mixing server-queue players into legacy slots. The common `API_URL` is now enabled. Old APKs will **not** randomly find new-queue clients: install the updated APK on both phones. The website updates via its service worker; Android needs a new APK/Play update.

## Enabled deployment and remaining checks

Worker fingerfight-api and D1 fingerfight-prod are deployed through the approved project-local CLI login. Both runtime secrets are validated. HTTPS/CORS/auth, real pairing/ack/cancel and bidirectional UDP/TLS relay smoke checks pass. Website deployment and APK package/signature/source/delivery checks pass. See backend/README.md and MULTIPLAYER_SETUP.md for the 800 GB usage guard, 1,000 period issuances, 20 requested-lifetime reservations, rate limits and explicit accounting dates. These are protective pilot limits, not unlimited production capacity or a guaranteed invoice ceiling.

Next acceptance: updated APK versus refreshed browser/second updated APK, Wi-Fi versus mobile data, including a match over ten minutes, background/reconnect, cancellation and rematch. Old ExpressTURN retirement follows successful acceptance. No support case or further owner token setup is required.

Queue allocation alone does not credit wins. The game still resolves peer hand messages locally, then both participants submit a compact terminal round transcript. The server recomputes it and credits a match only when both agree; a participant may also explicitly concede its own loss. Rankings are friend-scoped and are labelled confirmed, not camera-verified or cheat-proof. Completed scored queue matches close their lease without a disconnect warning. Native account sign-in uses a hosted browser ceremony and one-use PKCE grant; permanent bearer tokens never enter the deep link. Registered accounts can be deleted after recent authentication; unregistered device profiles can be deleted directly.

## Verification

Automated tests use the real Worker handlers and SQLite transactions with fake PeerJS transport. They cover 40 simultaneous entrants, native/website CORS origins, both controller seating orders, secret/peer checks, server relay configuration, two-ack activation, cancellation during registration, ticket ownership, blocks, expiry, lease renewal and orphan cleanup. This validates the application protocol, not real ICE/TURN connectivity or device camera/FPS.

As of 0.2.5, friends and invitations work with a saved device profile; sign-in is optional recovery/sync. Add an opponent in the lobby, game menu or results, then explicitly accept the friend request. Invite accepted friends directly into the existing private lobby. Guest sessions renew near expiry when used; storage loss without a linked recovery identity loses access to that device profile. Google sign-in remains gated on owner public OAuth setup; legacy passkeys remain optional.
