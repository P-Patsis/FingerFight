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
