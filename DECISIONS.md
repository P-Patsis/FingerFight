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
