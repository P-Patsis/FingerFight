# Optional accounts and the phone-app path

Proposed design, 2026-11-05. Accounts, friends, reports, invitations, push and shared leaderboards are not implemented by this change. No backend has been created and no messages/notifications have been sent.

## Keep guest play

The installed PWA remains the phone app for now; no Android build is needed for this iteration. Guest players can practise against the computer, customise, and play by code without an account. Signing in is optional and explained by its benefit: keep progress across phones, save friends and receive invitations. An editable display name is separate from the permanent account identifier. Existing local inventory/settings need an explicit merge policy when a guest first signs in.

PWAs can be installed from supported browsers without creating a native package: https://web.dev/learn/pwa/installation . Platform/browser behavior differs; installation/push needs actual Android/iOS testing.

## Identity and recovery

Choose a maintained authentication implementation before building social features. Candidate sign-in experiences are passkeys with a recovery path, or verified email links. Registration, challenge verification, sessions, recovery and account deletion belong on a backend; no private credentials belong in the static repository. Do not make an account mandatory for camera permission, trying a hand or local practice.

WebAuthn public-key credentials and relying-party verification: https://www.w3.org/TR/webauthn-3/ . Final method/provider is still a product/hosting decision, not selected or provisioned here.

## Friends and invites

- Add by exact friend code, link or QR, with a recipient-approved request. Use stable account IDs, not mutable display names.
- Friend states: outgoing request, incoming request, accepted and blocked. Prevent self-requests/duplicates; rate-limit requests on the backend.
- Invite opens a private room with an expiring invite ID. Accept/decline in the app; avoid publicly exposing long-lived room codes. Only accepted friends can invite by default.
- Start with in-app invitations. Add optional push after the user enables it, backed by per-device subscriptions and server delivery. Never depend on the phone maintaining an always-open peer connection while asleep. Revoke subscriptions on sign-out/account deletion and handle expired endpoints.

PWA push flow and server delivery: https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push . No platform support or notification delivery guarantee has been tested in this project yet.

## Block/report before broader discovery

A block immediately prevents new requests/invites and matching where identity is known. A report submits a bounded reason, match/account IDs and timestamp for a moderation queue. Provide a delivered/error status; an offline button must not claim that a report was sent. Keep raw camera photos out of reports by default; any evidence upload must be a separate explicit choice. The current app has no server moderation queue or durable authenticated opponent identity, so it cannot yet provide reliable account bans or account-level reporting.

Moderation ownership, appeal handling, data retention and deletion need concrete decisions before launch. Basic request/report throttles and server-side permission checks must ship with the feature, not after abuse begins.

## Friend leaderboards

Begin with casual friend-only head-to-head wins/losses, matches and a weekly view. Computer practice is stored separately and must never count toward player leaderboards. Store acknowledged match results using an idempotent match ID so retries cannot double-count.

The current P2P game trusts clients for hand counts. A client can fabricate its count or local statistics; adding accounts does not make those results cheat-proof. Both-player acknowledgement limits accidental disagreement but not collusion. Public ranked competition requires a separate trusted scoring/anti-cheat design, and cannot safely import arbitrary historical local wins.

## Minimum backend records

Users (stable ID, handle/profile), authentication identities/sessions, friend requests/edges, blocks, expiring invites, device push subscriptions, bounded report records and idempotent match results. Authorise every operation against the signed-in identity; a client must not be able to change another player's wins, contacts or reports. Keep game media P2P/local unless an explicitly agreed feature requires otherwise.

## Suggested order

1. Ship/review the current local computer mode and before/between-match customisation.
2. Decide authentication, guest-progress migration, recovery and moderation ownership; then implement optional accounts and block/report.
3. Accepted friends plus in-app invites, then optional push after device testing.
4. Casual friend-only statistics/leaderboards; evaluate ranked play separately.

The end-screen banner currently reserves space only. It contains no ad SDK, tracking request or payment mechanism. Real ad integration and any native-store packaging remain separate decisions.
