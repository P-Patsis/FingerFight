# Finger Fight

A two-player fighting game where you guess how many fingers your opponent is holding up. Built from the
finger-counting camera app: your phone's camera counts your fingers (MediaPipe hand tracking), and the other
player's phone does the same. Phone-to-phone over the internet with a 16-character private room code.

## How a round works
1. Pointer and guesser swap roles every round; both use their own camera.
2. Countdown defaults to 5 seconds; the finger limit defaults to 5 (host can choose 1–10).
   The optional fewer-fingers setting lowers the cap every five rounds, to a floor of 2.
3. At zero both phones capture finger data; only private photo styles send a JPEG.
4. A correct guess deals 1 damage to the pointer. A wrong guess or missing hand deals no damage.
   A closed fist is a valid zero. Gestures never score; the rude-gesture display filter defaults on.
5. Health defaults to 3 hits. Three consecutive no-hand rounds by one player cause an idle forfeit
   (warning after two); simultaneous idleness does not choose a loser. Private idle forfeits return
   both players to the lobby; random idle forfeits close the connection and return to the menu.

An open palm is an ordinary five. Finger/gesture recognition is approximate geometry.
Rules and defaults: `js/logic.js`; regression coverage: `tests/logic.test.js`, `tests/tuning.test.js`
and the idle flow tests.

## Starting a match
- **Create private match:** you get a long unique code (16 characters, about 80 bits, not guessable). **Copy code** or
  **Share link** and send it to a friend. By default you must tap **Accept** before anyone joins (switchable).
- **Join:** paste (or type) a friend's code. A shared link carries the code after the `#`, which browsers never send to any
  server, and the page removes it from the address bar after reading it.
- **Find a random opponent:** matchmaking with strangers. Strangers get generated names ("Fighter 4821"), and **no camera
  image is ever sent or shown**: phones exchange only finger data, and each phone *draws* the other's puppet hand or
  skeleton itself. A message carrying a photo is rejected, so a modified client can't push one at you.
- In a private match the host sets seconds, hits, finger limit, optional shrinking cap and one of five arenas.
  The lobby attempts camera setup automatically once; failures show a retry button. A random match starts when both players are ready.
- No camera? Add `?sim=1` to the address to set the hand by tapping (also how the tests drive the game).

## What your opponent sees of your hand (you choose, in Profile or the lobby)
| Style | What leaves your phone | Friends (private) | Strangers (random) |
|---|---|---|---|
| Skeleton | hand landmarks only; drawn on their phone | yes | yes |
| Puppet (an animated hand in a skin you pick, see [SKINS.md](SKINS.md)) | hand landmarks only; drawn on their phone in the skin you chose | yes | yes |
| Photo + skeleton | a real JPEG with the skeleton drawn on it | yes | **never** |
| Photo + puppet | a real JPEG with the puppet drawn on it | yes | **never** |

The photo styles show a warning (a camera frame can include your face or room) and exist only for private matches; against
a stranger they are not even offered, and a message carrying a photo is rejected by the receiver. Receivers can also switch
"Show my opponent's photos" off and get the drawn version instead. The puppet is also drawn over your own camera view.

## Run it locally
```
scripts/start.sh            # serves http://localhost:8082 (use ?sim=1 for no camera)
npm test                    # Node test runner; 223 tests at the last recorded run (Node 22 verified)
```
The camera needs **https or localhost**. To play with someone else, host it on https (GitHub Pages) and share the match code.
Both players need internet: the hand model (about 17 MB: 9.4 MB wasm + 7.8 MB model, from jsDelivr / Google, cached by the
browser) and the PeerJS introduction server.

## Privacy and security, honestly
- Static game files and bundled configuration are visible to visitors. There are no user accounts or live camera feeds.
- WebRTC encrypts peer traffic. `js/ice.js` currently supplies ExpressTURN UDP/TCP relay configuration
  with a static browser-visible credential. This is not a protected server secret; do not copy its value into logs.
  Random matches enforce relay-only ICE; private matches allow direct ICE with relay fallback.
  The relay operator can observe connection metadata, but not decrypted game content.
- Camera access occurs during lobby setup, round guess windows, explicit camera testing and Store/Profile
  try-on. Tracks are released at snapshots, on leaving relevant flows and when the page is hidden.
  Drawn views hide camera pixels on screen; they still use the camera for hand tracking.
- The public PeerJS server sees the match id and IP addresses (not the content). The matching slots for random opponents are
  public, so anyone can look for or wait in them.
- Every message from the other phone is validated (shape, ranges, photo type and size). The page is built with `textContent`,
  never `innerHTML` with remote text.
- A modified client can lie about its own count or gesture; accepted for a friends game.
- Not covered: abuse by strangers beyond the above (no moderation, no block list); use Leave any time.

## Layout
`js/logic.js` rules + message validation, `js/gestures.js` finger/gesture geometry, `js/net.js` PeerJS link,
`js/hands.js` camera + MediaPipe (and the simulator), `js/puppet.js` the 2D puppet rig, `js/skins.js` skin loader (`assets/skins/*.json`, see SKINS.md), `js/avatars.js` puppet/skeleton pictures, `js/fighters.js` artwork, `js/audio.js` sounds,
`js/main.js` screens and the round state machine, `vendor/peerjs.min.js` (PeerJS 1.5.4, bundled).

## Development status (2026-10-30)

Current branch: `main`. Latest layout and puppet-only/photo try-on toggle need device review;
Node tests use a fake DOM/PeerJS and do not prove real browser layout, camera accuracy or two-device connectivity.
The Store supports local inventory, ordered cosmetic stacks, colour pickers and effects.
Ad/purchase unlocks are demonstration stubs (`js/unlock.js`), not real transactions.
No notification service, accounts, friends system or game APK wrapper is implemented.

Canonical repository: https://github.com/P-Patsis/FingerFight (checked via GitHub API).
The local remote still uses the old FingerRing URL; changing it is deferred.
See [PROGRESS.md](PROGRESS.md), [DECISIONS.md](DECISIONS.md), [COSMETICS.md](COSMETICS.md)
and [TURN_REVIEW.md](TURN_REVIEW.md). Historical entries can describe superseded behaviour.

There is no bundler/build step or npm dependency installation required for tests. PeerJS 1.5.4
is vendored; MediaPipe 0.10.14 and its model are loaded externally. Python asset generators use Pillow.
For application asset changes, `node tools/stamp.mjs` updates the service-worker hash;
README-only changes do not require stamping.

## New cosmetic controls (2026-11-05)

The Nails category has a shared length slider; Knuckle claws joins redesigned animal talons and five-blade Scissor fingers. Hotdog fingers has varied bends/springs and a warm tan default. Clear all sits above the equipped list. New hands: Comic book (big count/impact callouts), Elemental (Water/Fire/Earth/Air), Chameleon and Ghost. The latter reuse [Vanish](https://github.com/P-Patsis/Vanish)'s background learner locally with the existing hand landmarks, not another model. Their camera camouflage stays local; opponents receive safe drawn stills. Move the hand briefly to uncover room pixels for learning. See PROGRESS.md and COSMETICS.md for validation/performance limits and phone-review needs.
