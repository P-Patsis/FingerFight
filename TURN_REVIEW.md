# TURN credential review — 2026-10-30

No credential values are included here. No application configuration, credentials or remotes changed.

## Current implementation

`js/ice.js` contains a static browser-visible ExpressTURN username/credential and UDP/TCP
endpoints. `turnServers()` returns that list; `setTurnServers()` is a test/runtime replacement
hook, not a credential issuance service. `js/net.js` supplies those servers to PeerJS/ICE.
Random matches request relay-only ICE; private matches allow direct ICE and relay fallback.
`js/main.js` refuses random search when no relay configuration exists. Presence of configuration
does not prove relay availability; live allocations were not tested during maintenance.

Any credential delivered to a browser can be inspected or reused. Build-time environment
variables, minification, a separate static JSON file or hiding it in a private source repository
cannot protect a credential embedded in public client assets. Static credentials risk relay
quota/bandwidth abuse. They do not by themselves decrypt WebRTC game traffic.

## Recommended future design (not implemented)

Keep a provider API key or coturn signing secret only in a small HTTPS backend/serverless worker.
Issue limited-lifetime TURN credentials to a bounded game session, using a managed provider's
temporary-credential API or coturn's timestamp/HMAC REST authentication. The browser receives
only the temporary ICE credentials and refreshes them before expiry/reconnection as needed.
Keep expiry long enough for expected matches and allocation refresh; test long sessions and drops.

Protect issuance with session validation, rate limits, per-session allocation/bandwidth quotas
and monitoring; use anonymous session IDs if accounts are unwanted. CORS alone is not an abuse
control. Exclude credentials from logs, URLs, persistent browser storage and service-worker
caches; serve issuance responses with Cache-Control: no-store. Preserve relay-only policy for
random peers, and fail clearly rather than silently falling back to direct ICE.

A static-only Pages deployment cannot keep the signing secret. A backend or managed broker is
needed for this approach. Provider choice, budget, expiry/quotas and migration/rotation need a
separate decision. No credentials were rotated; historical repository/cache copies may retain
old static values even after a future replacement.

References:
- coturn's official TURN REST authentication documentation:
  https://github.com/coturn/coturn/blob/master/README.turnserver
- RFC 7635 describes OAuth-based ephemeral STUN/TURN authorization (a separate mechanism,
  not the same protocol as coturn's timestamp/HMAC REST option):
  https://www.rfc-editor.org/rfc/rfc7635

GitHub API checks for both old FingerRing and FingerFight paths resolve to
https://github.com/P-Patsis/FingerFight.git (default branch main). Local origin remains unchanged.
