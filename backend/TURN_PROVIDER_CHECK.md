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

## 2026-11-16 — Requested expiry also failed acceptance

- Mint requested TTL 600 seconds at 13:03:38Z. An intentionally invalid password was rejected with TURN error 400, establishing a negative authentication control.
- Two UDP allocations exchanged payloads and sent authenticated refreshes every minute. Payload still passed at 617 seconds; a fresh allocation at approximately 620 seconds also accepted the credential.
- The normal bundle was restored with relay issuance off; temporary user removed and isolated accounting period removed. No website/APK activation or external support message sent.
- A separate 60-second temporary bundle comparison is checking a credential used before expiry versus one first used after expiry. It cannot change production defaults; the diagnostic always restores the normal 600-second bundle with relay off.
- These results concern acceptance/traffic, not direct proof of billing after expiry. Billing cessation is claimed by Cloudflare documentation but has not been independently measured here. Do not infer a safe charge cutoff from either 204 or the requested TTL.

Additional support questions: why does a fresh allocation accept the credential after the requested TTL, and how can the provider-confirmed effective expiration and billable-byte cessation be verified? Does authentication caching affect these observations?

## 60-second comparison result

At 13:20Z a temporary bundle explicitly requested TTL 60. Its returned refresh deadline confirmed the altered constant was active. One credential passed UDP/TLS payload checks before expiry; the other was never used before expiry. At 91 seconds both still authenticated fresh allocations. Thus caching of a previously authenticated credential alone does not explain the results. The normal bundle and disabled baseline were restored, and guest/isolated accounting period removed. Stop further identical expiry probes pending new evidence/provider guidance.

Copyable provider question (draft, not sent):

> Our Realtime TURN credentials remain usable after requested expiry and revocation. We use the documented generate-ice-servers endpoint with JSON ttl=600 and Content-Type application/json. Payload still relayed at 617 seconds and a fresh allocation authenticated around 620 seconds. A separate ttl=60 test accepted both a previously used and a never-used credential at 91 seconds. A deliberately wrong password was rejected (TURN 400). Revocation returned HTTP 204 but the credential authenticated 30 seconds later. Can you confirm the effective TTL/grace/cache semantics and how to verify billable usage stops? No production clients have migrated; issuance is disabled. We can provide account/key IDs privately if needed.

Do not send permanent tokens, issued credentials or CLI login data with the report.
