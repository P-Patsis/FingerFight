# Multiplayer rollout — current checklist

This is the current rollout checklist; PROGRESS.md contains the dated evidence. Existing website/APK clients still use the legacy matcher. Do not retire ExpressTURN until migration and real-device acceptance checks are complete.

## Completed and verified

- [x] Owner approved a restricted, project-local Cloudflare CLI login.
- [x] Dedicated fingerfight-api Worker and fingerfight-prod D1 database created.
- [x] HTTPS health, origin/auth guards, real D1 pairing, both acknowledgements and cancellation pass live smoke tests; temporary users cleaned up.
- [x] TURN app ID configured. Production Worker secret TURN_API_TOKEN is attached; its actual provider validity is not yet tested.
- [x] Minute monitoring and daily maintenance schedules registered; real monitor operation must be checked after runtime configuration is complete.
- [x] Protective 800 GB cutoff implementation and local regression coverage; 28 backend tests pass at the last code change.

## Owner action needed now

- [ ] In fingerfight-api → Settings → Variables and Secrets, add Production Secret **TURN_USAGE_API_TOKEN**, using the read-only Account Analytics token created under My Profile → API Tokens. Then Deploy. The owner reports creating the token, but the latest production secret-name listing only contains TURN_API_TOKEN. Creating the API token does not attach it to a Worker.

## Remaining rollout work I will handle

- [ ] Confirm both production secret bindings and test the runtime analytics token without exposing either value.
- [ ] Set a verified billing-period window for the cutoff. Obtain actual period dates from the owner before allowing a reset; do not assume a calendar-month reset.
- [ ] Verify managed credential issuance, expiry, provider revocation, scheduled monitoring and cutoff against the deployed backend.
- [ ] Probe actual relay connectivity. Separate protocol/API checks from real Android/browser crossplay evidence.
- [ ] Enable the common API URL only after backend checks pass; restamp/test/publish website and build/deliver the matching APK.
- [ ] Verify Pages and packaged APK source, signature and Downloads copy.

## Owner acceptance after the new APK is delivered

- [ ] Install the matching APK on the phone(s); use the updated website on the laptop. Old APKs use a different random queue after migration.
- [ ] Complete phone ↔ laptop/phone matches across Wi-Fi/mobile data, including Ready, background/reconnect, forfeit and rematch. Report actual results; automated tests do not replace them.
- [ ] Confirm the billing-period dates shown by Cloudflare, and later retire/rotate the old ExpressTURN credentials after updated clients are verified. This can break old APKs, so timing matters.

Current guard state: TURN_RELAY_ENABLED=false. Frontend API_URL is empty. The cutoff is protective admission control, not a provider-enforced guarantee of zero charges; it does not cap other Cloudflare products.
