# Multiplayer: Android and website

## What currently ships

Android runs its bundled copy of the game in Capacitor, at `https://localhost`. It does not open or send gameplay to the GitHub website. Website players load that same game from GitHub Pages. Both use PeerJS's public `0.peerjs.com` service to introduce peers, then exchange encrypted WebRTC data-channel messages.

Private matches use a long random room code and allow direct connections, with TURN as a fallback. Random matches enforce TURN-only connections to hide the opponent's IP; the current legacy relay is `free.expressturn.com` (UDP/TCP 3478). The server credentials already shipped in `js/ice.js` are public and revocable, not a production secret. Relay/network availability still affects whether a match connects.

APK 0.1.3 and the current website can find each other using the existing protocol, including random opponents. Their legacy random matcher uses eight public rendezvous slots; active matches retain those slots. Crossplay is supported by the code, but a completed real APK-to-phone/browser match has not been verified on devices. Computer practice is entirely local.

## Shared server queue implemented, awaiting deployment

`backend/matchmaking.mjs` and `js/matchmaking.js` add one common queue for updated Android and website clients:

1. Get or reuse a guest session; an account is optional.
2. Obtain relay configuration from the authenticated API. Managed TURN credentials are short-lived; the provider API token stays on the Worker.
3. Request a unique opaque PeerJS ID, register it, then mark the ticket ready. Unregistered peers cannot be assigned.
4. Atomically claim two ready players in a D1 transaction. There is no fixed eight-slot limit. Account blocks are checked in both directions; each player has one ticket.
5. Both clients install the assigned peer identity and pairing secret before acknowledging. Only after both acknowledge does the guest dial the host.
6. Exchange existing validated game messages over WebRTC. Random matches still reject camera photos. The API receives identity/connection metadata, not camera frames.
7. Renew the connection lease every 20 seconds; cancel/reload/expired leases release the assignment. A late cancellation cannot remove a newer search. Existing peer reconnect secrets and grace periods still protect the seat. Relay refresh updates future reconnects on this Link without replacing private-match defaults.

Waiting clients poll every two seconds and stop after two minutes. Initial assignment expires after 60 seconds, connected assignment after 120 seconds without renewal, and a waiting ticket after 90 seconds without polling. Cleanup runs on queue admission/readiness and through the scheduled handler. Limits remain finite: D1/Worker quotas, rate limits, signaling and relay capacity apply. The local concurrency test covers 40 clients/20 distinct pairs, not production load capacity.

A configured backend failure reports an error instead of mixing server-queue players into legacy slots. While `API_URL` is empty, the existing matcher remains in use. After activation, old APKs will **not** randomly find new-queue clients: install the updated APK on both phones. The website updates via its service worker; Android needs a new APK/Play update.

## Activation package and remaining checks

See `backend/README.md` for the schema, Worker bundle, bindings and relay-secret setup. Production `API_URL` deliberately stays empty until a real endpoint passes runtime checks. Cloudflare account lookup was rejected; no cloud resources or paid plan were created, and no alternative credential route was used.

After approval: provision the dedicated database/Worker, configure the relay, verify HTTPS/CORS/auth/queue/leases, set the **same** API URL for both clients, restamp the service worker, rebuild Android and publish. Then test an APK on one phone against an updated browser/second APK on another, preferably Wi-Fi versus mobile data, including background/reconnect, cancellation, full match and rematch.

Queue allocation records are not verified game results. The existing game still scores peer messages; the separately tested commit/reveal API is not yet wired to the round controller. Verified leaderboard UI stays disabled. Native passkey accounts remain hidden until Credential Manager/Digital Asset Links integration is implemented; native guest matching works independently. Browser passkey/friends features retain their existing deployment gates.

## Verification

Automated tests use the real Worker handlers and SQLite transactions with fake PeerJS transport. They cover 40 simultaneous entrants, native/website CORS origins, both controller seating orders, secret/peer checks, server relay configuration, two-ack activation, cancellation during registration, ticket ownership, blocks, expiry, lease renewal and orphan cleanup. This validates the application protocol, not real ICE/TURN connectivity or device camera/FPS.
