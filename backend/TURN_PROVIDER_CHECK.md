# TURN revocation verification — unresolved

Target: Cloudflare Realtime TURN, finger-fight app. No secrets or issued usernames are included here.

On 2026-11-16 from the deployment environment:

1. Server minted a credential through the documented generate-ice-servers API with TTL 600 seconds.
2. Two authenticated allocations successfully exchanged payloads in both directions over UDP/3478, then TLS/443. Allocations were deallocated afterward.
3. The deployed budget guard's synthetic high-water mark stopped further issuance.
4. Documented POST /v1/turn/keys/{key_id}/credentials/{username}/revoke returned HTTP 204 and was recorded in D1.
5. After waiting 30 seconds, a fresh UDP socket still authenticated and allocated with that credential. The new allocation was deallocated afterward.
6. Relay issuance was restored to disabled and the temporary guest was deleted. A separate old credential remained pending after repeated revocation returned 404; it is retained for audit/retry until expiry.

An alternate POST /credentials/revoke with a username JSON body did not fix the verification and has been removed. Do not repeat the same failed check without new provider guidance or a materially different test.

Questions for provider support (draft only; not sent):

- What is the expected propagation delay for credential revocation to prevent a fresh authenticated allocation?
- Does 204 revoke existing allocations, new allocations, or both? Is enforcement global across UDP/TLS edges?
- Is 404 expected on repeated revocation after a prior 204?
- Are there additional requirements beyond the published request format?

Official documentation:
https://developers.cloudflare.com/realtime/turn/generate-credentials/
https://developers.cloudflare.com/realtime/turn/faq/

Latest local evidence: .git/cf-relay-smoke.json (safe protocol summary), D1 turn_revocations (numeric provider status), .git/relay-final-tests.log. Credentials were never written into these reports. Website/APK clients have not been migrated. This is not an instant-cutoff or guaranteed-zero-charge acceptance result.
