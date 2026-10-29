# Finger Fight: decisions

- **Separate project from `fingers/`.** That app is a single page counting fingers; this one reuses its counting logic (in `js/gestures.js`, now aspect-ratio aware) and the same MediaPipe CDN setup.
- **Web app on GitHub Pages, PeerJS (WebRTC) for the room code.** No server of ours. The camera needs https, hence Pages. PeerJS is bundled (`vendor/`, 1.5.4, 93 KB); MediaPipe stays on the CDN (about 17 MB once per player).
- **Both players use fingers.** Pointer's count = the answer; guesser's count = the guess (0 = fist, no hand seen = no guess = a miss). Photos from both sides are shown at the reveal.
- **Damage rules** (`logic.js`, tested): right guess = guesser hits pointer for 1; wrong guess + pointer gesture = pointer crits the guesser (middle 2, moutza 2, sideways 3); otherwise a miss; pointer hiding their hand forfeits (guesser hits for 1). Only the pointer's gestures score, so gestures can't be spammed to win: a right guess beats them.
- **Both phones compute the result from the same inputs** (`resolveRound`), the host only paces the rounds. No authority server, so a modified client could lie about its own count/gesture; accepted for a friendly game.
- **Never trust the network:** names, guesses and reveals are validated (`validReveal`, `validGuessMsg`, `sanitizeName`); photos must be small inline JPEGs; the DOM is built with `textContent`, never `innerHTML` with remote text.
- **Gestures are geometry on MediaPipe landmarks, not a classifier.** Thresholds are in `gestures.js` (`MOUTZA_SPREAD`, `SIDEWAYS_RANGE`). Not tuned on real hands yet. Palm vs back of hand is not detected.
- **Simulator mode `?sim=1`** replaces the camera with tap controls. It is how the end-to-end tests run, and lets one person test the flow without a camera.
- **Tests run on a fake DOM + fake PeerJS** (`tests/harness.js`), driving the real `main.js`. The fake DOM mimics real behaviour where it matters (dataset and textContent are strings); keep it honest.
- **WebView lesson from Lab Calc:** if a canvas/viewer is ever embedded in a WebView, size it in pixels (percentage heights resolved to 0 there).

## Matchmaking, privacy and reveal styles (2026-10-26)
- **Three ways in:** private match (long code), join by code, random opponent. Private ids are `ffight-p-<16 chars>` (80 bits, so a code can't be guessed); random slots are `ffight-r-0..7`.
- **Random matchmaking without a server:** a searcher scans the 8 slots for a waiting host (empty slot = 'peer-unavailable', full = `{t:'full'}`, both mean "next"); if none, it claims the first free slot and waits up to 40 s, then scans again (random jitter so two searchers don't move in lockstep). A claimed id is unique at the PeerJS server, which settles races. Each attempt cleans up only its own link and waiter, so a cancelled search can't tear down a new one.
- **No camera pixels from strangers, enforced by the RECEIVER:** reveal/guess messages always carry structured finger data (`hands`, optional `lm` landmarks, `skin`); the receiver draws the cartoon/skeleton itself. In random matches a message with any photo, or with a photo-based view, is rejected (`validPicture(m, allowPhoto=false)`). Sender-side restrictions alone would not stop a modified client.
- **Private matches:** a player may send a photo style (photo / photo+skeleton / blurred+skeleton) after a warning; receivers can opt out ("Show my opponent's photos") and then get a cartoon drawn from the finger data. Message validation stays permissive for photos in private matches so a friend's photo can't stall a round.
- **Reveal styles are per sender** (what MY opponent sees of MY hand), remembered on the phone; random matches force cartoon/skeleton.
- **Join approval** (private, default on) and an 8-second hello timeout so a silent connection can't hog the room; protocol version 2 (older clients are turned away).
- **Code in the URL fragment** (`#room=`), cleared from the address bar after reading; `no-referrer` meta. A query string would be sent to servers and kept in history.
- **Random-match names are generated** ("Fighter 4821") so strangers can't use offensive names.
- **Corrected earlier claim:** PeerJS ships public TURN relays by default (traffic is encrypted, relays can't read it), so blocked networks fall back to relaying rather than just failing.
- **Not done on purpose:** a Content-Security-Policy meta (untestable here; a wrong one would break the camera/hand model silently), moderation / blocking, unlockable skins ("hands store" is a plain skin picker).

## 2026-10-27 — Reconnect = resume token, not "whoever has the code"
- Anyone with the match code can connect, so during a dropped connection the seat can't go to whoever shows up first. The guest invents a random token in `hello`; the host keeps the seat for 45 s for the connection that presents it. Random matches offer no token, so they never resume.
- PeerJS `config` replaces its default ICE list, so net.js repeats PeerJS's defaults (Google STUN, PeerJS TURN) and adds Cloudflare STUN.
- Heartbeat only enforced once the peer has pinged (older clients stay compatible).

## 2026-10-27 — Features that need a server are not built
- Push notifications (web push needs a server holding subscriptions and keys), friends lists, leaderboards, accounts and moderation all need a backend that stores data. The game has none on purpose (no accounts, no photos stored). A "friends" list that lives only on the phone and a custom-fighter editor do not need one.
- PWA first; a real APK wrapper (WebView, as Lab Calc does) is the next step if wanted.

## 2026-10-27 — Safety rules for camera + strangers (the project's hard rules)
- The only things that cross the network are small JSON messages (finger states, landmarks, numbers). No media track is ever added to the WebRTC connection, so there is no live camera feed to hijack.
- Photos exist only in private matches (friends who chose that style); the receiver draws everything for strangers and rejects any photo message. Nothing in the protocol lets a peer ask for a picture; round messages are accepted only for the current round.
- The camera is on only inside a guess window and is stopped at the snap (not just paused). Hidden page = camera off.
- Random matches end when the fight ends (the connection is closed, no rematch) and route through the relay (no IP exposure). A drop is a loss.
- Rejoin exists for private matches only, behind a 24-char secret, for 3 minutes.


## 2026-10-27 (evening) — Scoring and the rude-gesture filter
- **Only a correct guess scores.** No critical hits, no points for the pointer when the guesser is wrong or does not guess. Gestures are never an input to `resolveRound`.
- **Gestures are detected but filtered, default ON.** The filter is the VIEWER's choice (stored on their phone), applied when drawing a reveal: a rude picture becomes a plain hand with the same finger count, so the number is all you see. It is not a setting the sender can force on or off for the other player.
- **Old clients stay compatible:** `validReveal` still accepts a `gesture` field (known values or null/absent) and ignores it; unknown values are still rejected.
- **Screens must scroll from the top:** never combine `justify-content:center` with `overflow:auto` on a screen; use auto margins on the first/last child.

## 2026-10-27 (night) — Max fingers, role display, detection
- **Max fingers is a host setting like seconds/hits** and is part of the settings message. Over-limit counts are clamped by BOTH phones in `tryResolve`, so a modified client can't score by sending more.
- **Roles, not turns:** both players use the camera every round, so the UI says "YOU POINT" / "YOU GUESS", never "your turn / their turn".
- **Finger up = tip clearly farther from the wrist than the middle joint (x1.05, 3D).** The margin is a guess; 1.1 broke the sideways-gesture geometry. Re-tune on real hands before changing the thumb rule.
- **University/corporate networks can block WebRTC.** "Found the match but could not open a direct link" means a network, VPN or firewall is blocking peer connections, not a bug.

## 2026-10-27 (late night) — Audio, effects, relay, calibration
- **Fist = 0, no hand = no guess/no answer = miss.** A hidden hand is never scored for or against anyone.
- **Music is CC0 only, from OpenGameArt, credited in assets/audio/CREDITS.md.** Missing/undecodable file = no music for that arena, silently. Never add a track whose licence is not confirmed on its source page. Keep the folder under 4 MB. No re-encoding tool is installed here, so files are used as published.
- **Sound effects are synthesised, never files.** Music plays after the first user tap (browser rule) and only on the lobby/game/result screens.
- **Visual effects are code-drawn only and always optional.** Every public effect is wrapped so a failure cannot break a match; reduced motion disables shake/flash/wipe/confetti.
- **Relay servers live in js/ice.js and are EMPTY on purpose.** The PeerJS default TURN hosts are dead (no DNS), and no free relay works without an account. Random matches hide the IP through a relay, so without one they are refused with an explanation rather than hanging or silently exposing the IP. Do not paste a TURN credential into chat logs; it is public once it is in the page, so use a revocable one.
- **Thresholds are data (`TUNING`), not constants.** Change defaults only after looking at real numbers from the debug panel.
- **Never name a module variable `history`, `location`, `name` etc.** (it shadows the browser global; this broke the address-bar cleanup once).

## Service worker must self-update (2026-10-27)
Symptom: after a deploy the phone ran the new main.js against a cached old index.html and the buttons died until site data was cleared. Rules now:
- sw.js calls `skipWaiting()` on install and `clients.claim()` on activate, and deletes every cache except the current VERSION and `ff-heavy` (the MediaPipe model, cache-first, never changes).
- The shell (index.html, css, js) is NETWORK-FIRST with `cache: 'no-cache'`, and the install precache uses `cache: 'reload'`, so neither the HTTP cache (GitHub Pages max-age=600) nor an old precache can serve a stale file online. The cache is only the offline fallback.
- The page registers with `updateViaCache: 'none'`, re-checks for a new worker whenever it becomes visible, and reloads once on `controllerchange` (at once on the menu; during a match it shows an "Update available: tap to refresh" button instead).
- VERSION is a hash of every precached file: run `node tools/stamp.mjs` after ANY change to a shell file before committing. tests/sw.test.js fails if the stamp is stale, so a deploy cannot ship an old version name.

## Rooms, seats and the random queue, without a server (2026-10-28)
What pure P2P can and cannot do (PeerJS): the public PeerJS server is only a phone book (peer id -> socket). The room EXISTS only while the host's page is open and registered under its id; there is no place that remembers a room. So:
- Guest reloads/drops: fully recoverable. The host keeps the seat for 45 s (grace), the guest's saved session (ff-session, refreshed every 20 s, valid 3 min after the last refresh) is picked up AUTOMATICALLY on page load and resumes with the secret token.
- Host reloads: recoverable if the host comes back. The host's page is the room, so for a few seconds the room does not exist; the host re-registers the same id (`rehost`, retries while the phone book frees the old one) and the guest (grace, redialling every 3 s) resumes. If the host never returns, the guest cannot be rescued: nothing else holds the room.
- A reload cancels a fight in progress (game state is only in memory). Both sides go back to the lobby with their seats kept ('rejoined' / 'abort' messages). Persisting mid-fight state would be possible but was not asked for.
- Needs a server (not built, not needed for the above): a room that survives the HOST leaving, notifications, or a real matchmaking queue with global ordering.
Seat rules (net.js): a private room outlives its guest. `freeSeat()` forgets the guest completely. Graceful leave ('bye') frees the seat at once; a sudden drop starts the 45 s grace. Between fights (lobby / result screen) a fresh `hello` takes over a seat that is in grace or has been silent for two pings (about 6.5 s); mid-fight the seat stays reserved for the token holder. Host approval, if on, still applies. A waiting random host survives a joiner that connects and leaves without saying hello (searchers probe all slots at once).
Random queue: the old scan tried the 8 slots one Peer at a time (4-8 s) and then waited 40 s without scanning, so with 4 players they sat in 4 slots until their timers happened to line up (minutes). Now: (1) `Link.joinAny` looks at all 8 slots with ONE signalling connection; (2) each waiting host tells joiners how long it has waited ('queue'), and the joiner picks the longest wait (ties: lowest slot) after a 450 ms window; (3) waiting hosts hold a slot for only 7-13 s (jittered) before scanning again; the wait time counts from the START of the search, so a player who keeps re-hosting keeps their priority. Expected pairing time with any number of waiting players: seconds, not minutes (not measured with real phones).

## Names, profile, back button, flag (2026-10-28)
- NAMES (logic.sanitizeName): any language, numbers, spaces, symbols ($ * # & ' _ ...) and emoji (flags, joined families) are allowed; cap 12 visible characters (an emoji counts as one, Intl.Segmenter). Removed: control/invisible/format characters (this includes right-to-left override tricks and zero-width characters), private-use/unassigned, "<" and ">", stacked combining marks beyond 2, and runs of whitespace. Names are only ever shown as text; CSS isolates each name's text direction (Arabic cannot reorder the text around it).
- PROFANITY (js/names.js, lists at the top, easy to extend): name is folded (lower case, accents off, 0->o 1->i/l 3->e 4->a 5->s 7->t @->a $->s !->i, l read as i), split into words (separators and camelCase) and a word is flagged only if it IS a listed word (also plural, trailing digits, stretched letters) so Scunthorpe, Assassin, Penistone, Sussex pass. A very short OBSCENE_ANYWHERE list is searched inside the whole name (f.u.c.k, xXfuckXx). Lists: English, Greek (script + Latin letters), Spanish/French/German/Italian, Russian, a few Chinese. A flagged name is replaced WHOLE by "Naughty Player #123" (no star masking). Both sides filter: the sender and every receiver. Limits: creative spellings and unlisted languages (Arabic is not covered) get through; "Dick" is flagged on purpose (so is the name Dick). Add words, do not add short strings to ANYWHERE.
- KEEP YOUR NAME: random matches use the profile name. The HOST numbers a clash ("Pano" and "Pano (2)", case-insensitive) and tells the guest in `welcome.yourName`.
- HIDE-IP is a constant `true` (no toggle, old ff-hideip value ignored). Only random matches use the relay; private matches with a friend connect directly (they already share a code).
- FLAG: optional, default OFF. The country is NEVER looked up from the IP: it is the region of the browser's language (el-GR -> GR), editable as a 2-letter code in Profile, sent only as those two letters if the player turned it on, and the receiver accepts only /^[A-Z]{2}$/. A lookup service would see the player's IP (as STUN already does) and gives wrong answers on VPN/university networks, so it is skipped. Windows desktop browsers show letters instead of flag emoji.
- BACK BUTTON: any non-menu screen holds ONE extra history entry (`navSync` in show()). Back from lobby/game/result asks "Leave this room?" and on "no" re-pushes the entry: room and connection are untouched. Leave and Back-to-menu from Profile/camera test never ask. The Leave button is a red sticky bar at the top of the lobby and the result screen.
- SETTINGS AFTER A FIGHT: private matches only. "Back to lobby (change settings)" sends {t:'lobby'}; both phones return to the lobby with seats kept; arena/rules (host), hand style, sound are editable there. Ignored while a fight is running. The style and sound cards are ONE set of controls moved between the Profile screen and the lobby (no duplicate ids).

## Gameplay polish: flip, skeleton, open palm, wake lock, anti-grief, shrink (2026-10-28)
- OPEN PALM IS NOT RUDE. Five fingers, spread or not, is a normal valid move: never detected as a gesture, never filtered or penalised. Rude set = `RUDE_GESTURES` (middle, sideways) in logic.js. `GESTURES` still lists 'moutza' only so older clients' messages validate; the value is ignored.
- Skeleton pictures are normalised to the hand's bounding box (reveal and collage only). The live camera overlay must stay in video coordinates.
- Flip camera: `exact` facingMode first (so a browser that cannot do it fails instead of silently keeping the same camera), then deviceId, then restore. Never turn the camera on from Flip (it is only offered while the camera is on). The camera is still switched on only inside a guess window; the chosen side persists between rounds.
- Wake lock is tied to the game screen (`show()`), not to inGame flags, so every exit path releases it.
- Anti-grief: 3 consecutive no-hand rounds = FORFEIT (not a kick): the match ends through the normal game-over screen so a private room survives and both can change settings or rematch. Chosen because a kick would have to be negotiated over the connection and could be abused; a deterministic forfeit needs no extra message (both phones see the same reveal/guess messages). Constant `IDLE_ROUNDS`. Warn one round early.
- Fewer fingers over time is a HOST setting like max fingers, default OFF, only a lower cap (never raises the host's limit). Both phones clamp with the same `effectiveMax(settings, round)`.
- Every js module must be in sw.js SHELL (tests/sw.test.js checks).
- FORFEIT BY MATCH TYPE: an idle forfeit skips the result screen. Private: both phones return to the lobby, room and guest kept, ready flags kept. Random: connection closed, back to the menu with the reason. Wake lock follows the game screen in every match type. (Decided 2026-10-28.)

## Regression fixes (2026-10-28)
- COUNTRY CODES are case-insensitive on input and canonical on output (`countryCode` in names.js): real ISO regions only, EL->GR and UK->GB, region read from language tags. Unknown = NO flag, never a placeholder. From the browser, a bare language maps to a country only when one is obvious (a small table); never from an IP address.
- HAND STYLE is the player's saved choice; a random match only DISPLAYS the cartoon (`effectiveStyle`), it never overwrites the choice.
- MUSIC: only a real 404 is remembered as "no file"; a failed download or decode is retried after 15 s.
- TRACKING LOOP must never die silently: each frame is guarded, errors go to `cam.onError` and onto the screen.

## Opponent view, puppet and skins (2026-10-29)
- VIEW MATRIX: private = skeleton, puppet, photo+skeleton, photo+puppet; random = skeleton, puppet only. Enforced three times: the UI hides the photo options in a random match, the sender maps a photo choice to its drawn twin (`effectiveStyle`), and the RECEIVER refuses any photo / photo view (`validPicture(m, allowPhoto=false)`). Older views stay ACCEPTED from older phones (`LEGACY_VIEWS`) and are mapped to the nearest new one; they are never sent.
- ARENA is not a profile setting any more; the host picks it per match in the lobby.
- PROFILE LAYOUT: Player / How my opponent sees my hand / App settings (sound, volume, hide rude gestures, show opponent photos). One set of controls, moved between Profile and lobby (no duplicate ids).
- THE PUPPET IS A RIG + A SKIN. The rig (js/puppet.js) is pure geometry and knows only the 16 part names, pivots, lengths and the palm's 3 reference points. Everything visual is data in assets/skins/*.json (format in SKINS.md). New skin = new file + manifest entry; no code change. Overlays and part order are part of the format so rings, gloves, nails, tattoos and animal hands can be added later as more shapes.
- SKINS ARE VALIDATED like network input: plain #hex colours, path-data-only strings, bounded sizes, no url()/references, so a skin file (or one day a downloaded one) cannot carry script or external references. A skin that fails is skipped; a built-in 'plain' skin guarantees the puppet always draws.
- THE SKIN ID IS ALL THAT TRAVELS. The receiver draws with its own copy; an id it does not have gives the manifest default. Nothing drawn by a sender is ever shown.
- NO second tracking pass for the puppet: it is drawn from the landmarks the tracker already produced, in the same loop iteration, only when a new video frame was analysed. Two hands = about 70 canvas draw calls per frame.
- No store, payments, ads or unlockables were built; the picker lists the manifest.

