# Finger Fight backend — local MVP, not deployed

This is a real Worker/D1 API with a runnable local SQLite adapter, passkey verification, friend/invite/report/block records and server-scored committed rounds. No Cloudflare resources were provisioned: the account lookup was declined during this session. There is no public API URL yet. The GitHub Pages game still uses its existing PeerJS transport and local player statistics.

## Run and verify

Requires Node 22+ (the local adapter uses `node:sqlite`; Node may print its experimental-feature warning). From the repository root:

```sh
npm --prefix backend ci --cache "$PWD/.git/npm-cache"
npm run test:backend
npm run build:backend
npm --prefix backend run dev
```

The development API binds `0.0.0.0:8787`, with health at `http://localhost:8787/health`. Default allowed browser origin is `http://localhost:8788`; set `FF_APP_ORIGIN` and optionally `FF_API_PORT` for local testing. Localhost is needed for a browser passkey test without HTTPS. Other devices over plain LAN HTTP will not provide a valid production passkey test.

`backend/.data/` stores only local development state and is ignored by git. The backend suite includes real-verifier authentication tests and shared-queue/crossplay integration tests; see PROGRESS.md for the latest count. The tests use isolated in-memory databases and software P-256 authenticators, including the actual SimpleWebAuthn verifier, rather than accepting mocked authentication results. `backend/dist/worker.mjs` is a generated, ignored bundle (~330 KB). Server dependencies do not ship to the game/browser.

## Shared Android/website matchmaking

The queue is implemented and connected to the frontend when `API_URL` is configured, but is **not deployed/enabled**. See [MULTIPLAYER.md](../MULTIPLAYER.md) for current versus new behavior and device acceptance checks. `deploy.metadata.json` allows both the website origin and Capacitor's `https://localhost`; no wildcard CORS. Native passkey UI remains hidden pending native credential integration; guest matching does not require passkeys.

Set Worker secrets `TURN_KEY_ID` and `TURN_API_TOKEN` for Cloudflare Realtime TURN. The Worker calls the credential-generation endpoint with a 3600-second TTL and returns only TURN URLs and temporary client credentials (refresh advertised after 3300 seconds). Never put the provider API token in browser code, git, deployment metadata or logs. Alternatively an operator can supply `TURN_SERVERS_JSON` as a Worker secret containing its own valid TURN URL/username/credential objects; that alternative's actual credential lifetime is controlled by the operator, not the response's refresh time. Missing relay configuration returns 503; server-queue clients never fall back to exposing IPs or using legacy public slots.

For local integration, the HTTP adapter accepts these same environment variables and optional `FF_ALLOWED_ORIGINS` (comma-separated); its default remains localhost. Do not use fake relay credentials for a device connectivity claim. The development URL is `http://localhost:8787`; it is not a phone-accessible deployed endpoint.

## API

All bodies are bounded JSON (20 KB), all non-health responses are uncached, SQL inputs are bound parameters and sessions are opaque random bearer tokens stored as SHA-256 hashes. Browser requests must match an allowed origin. User/IP buckets bound request volume; production signup abuse controls still need deployment review.

- `POST /auth/guest {name}`: temporary account-upgrade session. Existing legacy gameplay remains independent of this API; guests cannot use social features.
- `POST /players/session {name}`: guest matchmaking identity/session (120 creations/hour/IP; reuse existing sessions). Registered sessions can also use the queue. Neither requires photo uploads.
- `POST /queue/join {client}`, `/queue/ready {client}`, `/queue/poll {client}`: client is a fresh UUID per search. Join allocates an opaque PeerJS ID; only ready, unpaired, unexpired tickets can be claimed. Pair claim, match creation and pairing secret creation run in one atomic D1 batch.
- `POST /queue/ack {client,pair}`: install pairing guards first; both acknowledgements activate the assigned connection. Poll renews connected leases. `POST /queue/cancel {client}` releases both assigned seats; expired assignments and orphaned tickets are cleaned up. Another client/tab cannot take over an existing ticket.
- `POST /rtc/config {}`: authenticated relay setup; provider secrets never leave the server. Client relay credentials necessarily reach the two clients.
- `POST /auth/register/options`, `POST /auth/register/verify {id,response}`: upgrade the current guest with a discoverable, user-verified P-256 passkey. Rotate/revoke guest sessions on success. One passkey per account in this MVP.
- `POST /auth/login/options`, `POST /auth/login/verify {id,response}`: discoverable passkey login. Challenges expire in five minutes and are consumed once. Origin/RP/signature/UV and credential counter are verified by pinned `@simplewebauthn/server`.
- `POST /auth/logout`, `GET/PATCH /me`, `DELETE /me {confirm:true}`: profile/session/account operations. Deletion requires recent passkey authentication and cascades linked account records. No passwords/email are collected. Recovery currently depends on the user's passkey provider; email recovery and additional-key management are not implemented.
- `GET/POST /friends {code}`, `PATCH /friends/:id {accept:true}`, `DELETE /friends/:id`: recipient-approved friends; duplicate/self/blocked requests rejected.
- `GET/POST /blocks {target}`, `DELETE /blocks/:target`: block/unblock; blocking removes friendship and invalidates pending invites. Pair checks prevent new invites/matches in either direction.
- `GET/POST /invites {target,code}`, `PATCH /invites/:id {accept:boolean}`: accepted friends only; private room codes expire after ten minutes. Only the recipient can accept. The game host still approves the actual private-room join.
- `POST /reports {target,reason,detail,match?}`: bounded reasons (`abuse`, `cheating`, `name`, `other`) and details (500 characters), stored in a pending moderation queue. No public report-reading route, photo upload or automatic ban. A human moderation workflow/owner remains to be established before public launch.
- `POST /matches {opponent,settings}`, `POST /matches/:id/accept {accept:true}`, `GET /matches/:id`, `POST /matches/:id/cancel`: friends-only, recipient-approved server match records; members only.
- `POST /matches/:id/turn`: commit `{round,commitment}` then reveal `{round,value,nonce}` after both players committed. Commitment is SHA-256 of `matchId:round:value:nonce` (`null` for no hand). Nonce is 32 random bytes represented as 64 lowercase hex digits. A browser client implementation is `Service.lockRound()` in `js/service.js`.
- `GET /leaderboard`: the current account and accepted friends only. Counts completed server matches, never uploaded win totals or computer/local statistics.

The server derives roles, paired-turn finger limits, minimum choices, health, wins and three-idle-round forfeits from shared rules. Conditional updates prevent a round scoring twice. No API accepts arbitrary leaderboard wins. Counts are still self-reported by clients: committed rounds stop changing a guess after disclosure, but cannot prove what a real camera saw or prevent two accounts colluding. This is appropriate for casual friend results, not a claim of cheat-proof ranked competition.

## Deployment review and remaining integration

1. Approve access to the intended hosting account. The earlier Cloudflare account lookup returned `user rejected MCP tool call`; do not work around that denial with another credential/provider.
2. Inspect that account, create a dedicated D1 database without replacing existing resources, and apply `schema.sql`. Fill its ID in `deploy.metadata.json`; no secrets belong in that file or the browser.
3. Configure the relay secrets described above, then upload the bundled ES module with those bindings using the connected Cloudflare API or the current `cf` CLI. This project has no Wrangler configuration. Enable the worker's HTTPS endpoint and a daily cleanup schedule for its provided `scheduled` handler. Check account limits before public traffic.
4. Validate bindings, atomic pairing, both-player acknowledgement, cancellation/expiry, managed TURN and CORS for both allowed origins. Validate real browser passkey registration/login on Android/iOS and the target RP domain. Current proposed browser origin/RP is `https://p-patsis.github.io` / `p-patsis.github.io`. A dedicated production hostname is preferable before broad account adoption; RP changes require a credential migration plan.
5. Only after deployment verification, set `API_URL` in `js/service-config.js`, stamp the SW, rebuild Android with the same URL, and publish. Old APKs use the legacy random slots and must be updated to enter the new queue. The optional Account & friends screen is hidden while no URL is configured. It supports accounts, friendship approvals, invites, blocking, reporting and deletion. Passkey prompts still require real-device verification.
6. **Verified leaderboard activation is a separate release gate:** connect authenticated PeerJS participants to backend match IDs, run both clients through commit/reveal, use server results, and implement reconnect/retry/cancellation handling. `Service.lockRound()` and the match API are tested together, but the existing game loop does not call this API yet. Accordingly the social screen's leaderboard is disabled by default. Do not label ordinary current P2P games “server verified” or import local wins.

Production deployment, live passkey prompts, peer/account match bridging, push notifications, extra credentials/recovery and an operational moderation UI are not claimed complete. This API/source/test bundle is the concrete backend implementation to review before enabling it.

## References

- https://simplewebauthn.dev/docs/packages/server
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/
- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
- https://developers.cloudflare.com/realtime/turn/generate-credentials/
- https://www.w3.org/TR/webauthn-3/
