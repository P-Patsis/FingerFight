# Finger Fight: progress

## NEXT / pending decisions (read this first after a crash)
- Live at https://p-patsis.github.io/FingerFight/ (repo P-Patsis/FingerFight, public; local git remote still says FingerRing, GitHub redirects). Installable as a PWA (Chrome menu, Install app).
- User's first real test (2026-10-27): "kinda works". Complaints handled: unstable connection (reconnect + resume token), no rejoin (rejoin button), random skins, camera safety. NOT yet re-tested on phones after these changes.
- Ideas the user raised, status:
  1. Push notifications for "invite friend": NOT built. Needs a tiny server (web push needs a server that holds anonymous subscriptions and signs pushes with a private key; every app does this, Google/Firebase just hides it). Plan: Cloudflare Workers free tier, anonymous random IDs, no emails. Needs the user to create the account and agree; ask permission model: request notification permission only after a user tap ("Invite friend"), never on load.
  2. Friends list: local only (phone-stored list of anonymous friend IDs/names, "Challenge" button that opens a private match and shares the invite). Needs no server; invites only arrive by push if (1) exists, else by the Share sheet.
  3. Leaderboard: user thinks it makes little sense for a vs game; skip. Local win/loss records only.
  4. Avatar store ("10p per skin", user draws the art): skins are data (sender sends only a skin id, receiver draws from its own copy, so strangers never push images). Fighters (pre-built) + hand skins (puppet for players who don't want to show a camera). Real payments need a server and a payment provider (Stripe, or Play Billing in an APK); client-only unlocks are trivially bypassed. Plan: build the skin/fighter asset format and a free picker first; payments last.
  5. APK wrapper (WebView, like Lab Calc) instead of PWA: not built; needs the user's yes.
- Safety rules the user insists on (see DECISIONS.md): camera never left on, no feed or photos to strangers, nothing exploitable after a match, strangers only puppet avatars.


Newest first.

## 2026-10-28 (later) — Back button, Profile & settings, names, flag (NOT YET TRIED ON PHONES)
- Changed: see DECISIONS.md "Names, profile, back button, flag". New: js/names.js, Profile screen, red Leave bar, history-based Back with confirm, "Back to lobby" after a fight, optional flag, hide-IP always on (toggle removed), random matches keep the profile name (clash numbering), profanity filter incl. d1ck / pu$$y / nlgga. Also fixed a crash when leaving while the camera was still enabling.
- Tests: new names.test.js, nav.test.js; updated logic / random-flow / relay / flow.host / seats tests. 126/126. Connection layer (82ad16f) untouched apart from names in hello/welcome.
- Verified: automated only. NOT seen on a screen: Profile layout, the sticky Leave bar over the lobby code box, the real Android Back button.
- Open: phone test list given to the user.

## 2026-10-28 — Connection layer: reload, stale seats, random queue (NOT YET TESTED ON PHONES)
- Changed: js/net.js (`joinAny`, `freeSeat`, `expectResume`, 'queue' message, seat takeover, resume works on a re-opened room), js/main.js (hostSeatFreed/backToLobby, auto-rejoin on load, session saved from room creation and refreshed every 20 s, 'rejoined'/'abort', random search via joinAny), tests: new seats.test.js and queue.test.js, updated flow.host / flow.random.join / reconnect tests. 114/114. See DECISIONS.md "Rooms, seats and the random queue".
- Behaviour now: guest leaves or drops -> host stays in the lobby ("X left. Your room is still open"), same code works again; host sees "X disconnected (reloading?). Waiting for them to come back"; reloading either side re-joins by itself; a reload mid-fight cancels the fight, seats are kept.
- Verified: automated (fake PeerJS) only. NOT verified with real phones: real timings of reload/rehost, the 8-slot probe on real PeerJS, relay path.
- Open: phone test list given to the user; a fight cannot survive a reload.

## 2026-10-27 (night, final) — The real cause of the dead buttons: an unclosed HTML comment
- User saw "out of date (missing: overLeave, againBtn)" even on a fresh load. Cause: `<!-- ===== Game over =====` in index.html had no `-->`, so browsers swallowed the whole result screen up to the next comment end. This was introduced with the collage commit; it was the REAL cause of the dead Enable camera / Camera test buttons too (the missing-element crash), not (only) a stale cache. My Node fake DOM does not parse comments, so the tests missed it.
- Fixed: comment closed; tests/ids.test.js now checks every comment is closed and ignores ids inside comments (verified it fails on the old file). SW VERSION ff-8470d479. 106/106.

## 2026-10-27 (night, last) — Self-updating service worker
- User: camera works after the reload. Changed: see DECISIONS.md "Service worker must self-update". New: tools/stamp.mjs (VERSION = hash of the shell files, now ff-ac696c68), tests/sw.test.js, update handling in main.js (auto reload on the menu, banner during a match). 106/106.
- Verified: automated only. NOT verified: a real update cycle in a browser (needs one more deploy after this one, then reload twice).
- Open: first load after this deploy still runs the previous worker once; from the next deploy on, updates apply by themselves.

## 2026-10-27 (night, later) — Dead buttons: stale cached page vs new script
- Symptom (user): "cannot set properties of null (setting 'onclick')", Enable camera and Camera test dead. All ids exist in the current index.html (live too), so the phone was running the new main.js with an OLD cached index.html (GitHub Pages sends max-age=600 and the service worker's fetch used that HTTP cache). Cause inferred, not reproduced.
- Changed: service worker fetches site files with `cache: 'no-cache'` (VERSION ff-v4); `$()` in main.js no longer returns null (a missing element is reported on screen as "This page is out of date (missing: ...)" instead of killing every later handler); new tests/ids.test.js checks every id used exists in the HTML. 104/104.
- Open: user to reload (clear site data once if it persists) and report.

## 2026-10-27 (night) — Free TURN relay added; Enable-camera hardening
- Changed:
  - `js/ice.js`: ExpressTURN free-tier relay added next to the kept STUN servers (direct first, relay as fallback; random matches are relay-only). Probed the host first: UDP 3478 and TCP 3478 answer STUN, so both are listed. Port 443 serves a certificate for a different hostname (no `turns:`), 80 and 5349 gave no STUN reply, so no other endpoints were invented. The credentials are free, revocable and PUBLIC in the client; rotate them in the ExpressTURN dashboard after multiplayer is confirmed.
  - Random match no longer refuses with "no relay" (`hasRelay()` is now true by default); new test checks STUN + both TURN URLs ship.
  - Enable camera: the 17 MB hand model now lives in its own `ff-heavy` cache that survives site updates (the 'ff-v2' bump had wiped it, so the button waited on a re-download); slow-load message after 20 s; errors in the camera path or anywhere on the page are written on screen.
- Verified: automated 103/103. NOT verified on a device: an actual relayed connection (credentials checked only by endpoint reachability, not an authenticated allocation), the camera button on the phone.
- Open: test a random match and a university-network match; then rotate the TURN credentials.

## 2026-10-27 (late night) — Music, sound, effects, final collage, calibration panel, robustness audit (NOT YET TRIED ON PHONES)
- User decisions: a closed fist is a real 0; NO HAND AT ALL = "no guess" (the round is a miss, nobody takes damage; a hidden pointer hand is "no answer", also a miss). The old "hide your hand = free hit for the guesser" is gone.
- Changed:
  - MUSIC: one CC0 loop per arena (Dojo, Neon Street, Rooftop Sunset, Volcano Arena, Space Station) in `assets/audio/*.ogg`, 2.3 MB total, credited in `assets/audio/CREDITS.md` (OpenGameArt pages read, CC0 confirmed). Lazy-loaded after the first tap, looped, crossfaded on arena change, silent if a file is missing; cached by the service worker (cache first).
  - SOUND: effects are synthesised (Web Audio): UI tap, countdown tick, round start, round end, punch whoosh, hit (scaled by strength), block, miss, KO, win, lose. Master volume slider + mute in the menu, remembered in localStorage. Every note disconnects itself when it ends.
  - EFFECTS (all code-drawn): particle burst on a hit (capped at 140, rAF only while particles exist), white flash, screen shake scaled by hit strength (bigger on the last hit point and along a streak), COMBO xN pulse, a wipe between rounds, confetti on a win, rain on a loss; a wrong guess is a BLOCK (blue sparks, block sound), no hand / no guess is a plain miss. Reduced motion (device setting): no shake, flash, wipe, confetti or rain, a few slow particles only; the CSS media query switches the animations off too.
  - FINAL COLLAGE: the result screen lists every round as a column, player 1's hand on top and player 2's below, scrolling sideways. The guesser's picture of a correct guess is tinted green with "GUESSED IT!". Pictures go through the same rude-gesture filter and photo rules as the reveal.
  - CALIBRATION: the menu has "Camera test & finger calibration" (camera on with a badge, off with Done), and the camera box has a Debug button during a match. The panel shows count, hands, gesture, fps, the model's confidence per hand, and per finger the measured ratio against its threshold, with sliders for every threshold (`TUNING` in gestures.js, saved on the phone), Copy numbers and Reset.
  - ROBUSTNESS (what I found): (1) REAL BUG, relay: the TURN hosts PeerJS ships (eu-0 / us-0.turn.peerjs.com) have no DNS records any more, and openrelay.metered.ca resolves to a reserved test address, so relay-only random matches could never connect and private matches had no relay fallback. Removed the dead hosts; relays now live in `js/ice.js` (empty until the user adds a free-tier TURN account). With no relay, a random search says so instead of hanging. (2) REAL BUG, camera: a camera that finished starting AFTER release() stayed on (light on, nobody owning it); HandCam now cancels it. (3) GAP, camera: a camera ended by the OS / revoked permission left the CAMERA ON badge lit; now `onLost` hides it and tells the player. (4) GAP, reconnect: `Link.nudge()` re-opens the signalling socket and re-dials at once on the browser's `online` event and when the page becomes visible. Already fine: camera tracks are really stopped by release() (existing test), the grace period and resume token.
  - Fixed on the way: a module variable named `history` shadowed the browser's `history` (broke clearing the room code from the address bar); caught by the tests.
- Verified (automated, Node, 102/102, repeated runs): everything above except what needs a browser; includes tests for the audio module, track files and credits, the effects under reduced motion, tuning clamps/persistence, debug text, the camera races, relay config and the no-relay message.
- Verified on a device: nothing. Not seen on a screen: the effects, the collage layout, the debug panel. Not heard: the music (loop seams unchecked) and the synthesised sounds.
- Open:
  - NEEDS THE USER: a TURN relay account for random matches and for university-type networks (see js/ice.js). Free tiers exist (Metered, ExpressTURN, Cloudflare Calls); the live servers I probed answered but need credentials.
  - The Space Station track is 134 s: decoded it is about 47 MB of memory (stereo float); fine on most phones, shorten it if the game stutters there.
  - Finger detection still untuned on real hands: use the new panel and Copy numbers.

## 2026-10-27 (night) — Clearer turns, max-fingers limit, finger detection tweak (NOT YET TRIED ON DEVICES)
- User feedback: it works; the laptop could not connect because the UNIVERSITY NETWORK blocks it (not a bug; the new join errors name a blocked link); not clear whose turn it is; finger detection "isn't great"; wants a max-fingers option for quicker matches.
- Changed:
  - Turn clarity: the middle bar now shows a big coloured "YOU POINT" (gold) or "YOU GUESS" (cyan) with a one-line explanation, and the bar's border takes the same colour; the round banner says the same. (Both players use their camera every round; only the roles differ.)
  - New lobby setting "Max fingers" (1-10, default 10; 5 = one hand), set by the host like seconds and hits, sent to the guest. Anything above the limit counts as the limit on both phones (and is drawn as a plain hand); the live count, the simulator buttons and the camera caption respect it.
  - Finger detection: distances now use the landmark depth (z), so a finger pointing at the camera is not read as folded, and a finger must be clearly extended (tip 5% farther from the wrist than its middle joint) so half-bent fingers stop flickering up/down. Thumb rule unchanged (a stricter thumb rule broke the synthetic tests and could not be justified without real hands).
- Verified (automated, Node, 84/84, run 3 times): all earlier tests plus max-fingers setting limits; one flaky random-host test fixed (it checked a message before it arrived).
- Verified on a device: nothing yet. The detection change is NOT tuned on real hands; the max-fingers clamp is covered only by the settings test, not an end-to-end round.
- Open:
  - Detection: need specifics (which finger, over- or under-count, which camera/distance/lighting) to tune. Candidate next steps: stricter thumb rule from real data, smoothing over more frames, a higher camera resolution, lower hand-detection confidence.
  - Decide whether hiding your hand should still give the guesser a free hit.

## 2026-10-27 (evening) — Only correct guesses score; rude-gesture filter; scrollable menu/lobby (NOT YET TRIED ON DEVICES)
- Why: user feedback after trying it: score only when you guess correctly; keep it PG; the menu is not scrollable and "Copy code" is hidden; a laptop could not connect.
- Changed:
  - Scoring: critical hits are gone. A right guess hits the pointer for 1; a wrong or missing guess is a miss for everyone. (A pointer hiding their hand still forfeits the round: unchanged, see Open.) The lobby's "Critical gestures" setting and the CRITICAL banner/sound path were removed; `crits` is ignored if an old client sends it.
  - Gestures (middle finger, moutza, sideways) are still DETECTED and sent, but never score. New per-player setting "Hide rude gestures (show only the number)", default ON, saved on the phone (`ff-rude`). With it on, a reveal or guess picture that looks rude (gesture flag, or only the middle finger up, or landmarks classified as a gesture) is replaced by a plain drawn hand with the same number of fingers and no photo, and the gesture is not named or shown on the live camera label. With it off, the gesture's name is shown as a badge (still no scoring).
  - Layout: `.screen` used `justify-content:center` + scrolling, which clips the top of tall content and cannot be scrolled to (that hid the match code and Copy button). Now auto margins centre short content and tall content scrolls. The match-code box is sticky at the top of the lobby with large Copy / Share buttons; the "someone wants to join" card scrolls into view and has a gold border; smaller logo on short screens; wider cards on laptops.
  - Join errors are now specific (no such match / link blocked within 15 s / cannot reach the matchmaking server / browser lacks WebRTC) instead of one generic line.
- Verified (automated, Node, 83/83): updated rules tests (gestures never score, missing guess scores nothing), flows as host and guest with the default filter (gesture not named), message validation still accepts an old client's gesture field.
- Verified on a device: nothing yet. Layout and the filter have not been looked at on a screen.
- Open:
  - LAPTOP CONNECTION: cause unknown. Need the exact message the laptop showed (and the phone's state: did the host see a "wants to join" card?). Likely suspects: VPN/firewall or ad-blocker blocking 0.peerjs.com / WebRTC, or the host's approval card having been off-screen (fixed above).
  - Decide: should a pointer who hides their hand still give the guesser a free hit? (Strict "only correct guesses score" would make it a miss.)
  - The filter can't hide what a real photo shows if a modified client omits its landmarks and gesture; photos exist only between friends in private matches, who can switch them off.

## 2026-10-27 (later) — Safety pass: camera off by default, strangers forfeit on drop, relay-only for strangers (NOT YET TRIED ON PHONES)
- Found: the camera stream was opened in the lobby and stayed on (light on) for the whole match; `pause()` only stopped the analysis. Fixed.
- Changed:
  - Camera opens only for the guess window of a round, is stopped (tracks ended) at the snap, between rounds, on game over, on Leave, and whenever the page is hidden or closed (visibilitychange / pagehide). A red "CAMERA ON" badge shows exactly while it runs.
  - Random matches: a drop or quit mid-fight is a forfeit (the other player wins; if MY network is down I lose and am told). The connection is closed when the fight ends, no rematch with strangers.
  - Random matches connect through the relay only (`iceTransportPolicy: relay`) so a stranger never learns your IP; switch in the menu ("Hide my IP from strangers", default on).
  - Rejoin: window cut from 20 to 3 minutes; cleared when the fight is over, on Leave, on a failed rejoin; the button never appears for random matches.
  - After a fight the other phone closing no longer throws you off the result screen; private matches say "Your opponent has left".
  - CSP meta: no plugins, no `<base>`, no form posts (a stricter script/connect policy is not set: untestable here without breaking the hand model).
- Verified (automated, Node, 83/83): camera tracks really stopped by release(); relay flag reaches PeerJS; forfeit win and drop-loss; result-screen behaviour; plus all earlier tests.
- Verified on a device: nothing yet. Needs checking: the camera light goes out at each snap; the relay-only random connection actually connects (PeerJS's free TURN servers may be slow or full).
- Open: if the relay is unreliable, random matches will fail to connect rather than leak the IP (by design); a server of our own is the real fix.

## 2026-10-27 — Reconnect, rejoin, installable app, random skins (NOT YET TRIED ON TWO PHONES)
- Why: first real test: "kinda works", connection unstable, no way back into a lobby.
- Changed:
  - Link: heartbeat (ping every 3 s, silent 10 s = dead, only once the peer has pinged), then a 45 s grace period in which the guest re-dials and the host holds the seat. The seat is taken back only with a resume token (24 random chars offered in `hello`, over the encrypted channel); strangers and wrong tokens get `full`.
  - Fight resync: the host replays an unfinished round and sends `sync` (hit points, round); a dropped connection never costs a hit.
  - "Rejoin your last match" button (private matches, saved 20 min in localStorage, cleared on Leave). Host re-claims the same room id; guest re-dials with the token.
  - Extra STUN server (Cloudflare) alongside PeerJS's defaults. Red "Reconnecting…" badge.
  - Installable PWA: manifest, icons (scripts/make_icons.py), service worker (site files network-first, hand model cached once).
  - Random cartoon skin by default (dice button = a new random skin each match; picking one still pins it).
- Verified (automated, Node, 69/69): grace period, stranger and forged token refused, real guest taken back, mid-fight resync and round replay, session cleared on Leave, token offered in hello.
- Verified on a device: nothing yet. Not exercised: real network drops (wifi to 4G), the service worker, installing.
- Open: random matches have no resume (strangers, no token). Push notifications, friends, leaderboards and a custom fighter need a server (see DECISIONS.md).

## 2026-10-26 (later) — Private/random matchmaking, privacy hardening, reveal styles (NOT YET TRIED ON REAL CAMERAS / PHONES)
- Changed:
  - Menu: Create private match (16-char code, copy/share), Join with a pasted code, Find a random opponent (with Cancel).
  - Privacy: random matches exchange only finger data; the receiver draws the cartoon/skeleton and rejects any photo. Host approval for private joiners, hello timeout, code in the `#` fragment (cleared after reading), `no-referrer`, generated names for strangers, protocol v2.
  - Reveal styles chosen per player: cartoon hand (8 skins), skeleton, blurred photo + skeleton, photo + skeleton, photo (numbered fingertips). Photo styles only in private matches, with a warning and a receiver opt-out.
  - Fixed along the way: a count of 0 drew a "?" instead of a fist; two-hand avatars put the left thumb outside the picture; a cancelled search could tear down a newer one.
- Verified (automated, Node, 64/64): rules and damage; gesture geometry; every network message shape incl. all photo/safe-view cases; cartoon and skeleton drawing for every skin and count; HandCam.snap() on synthetic hands for all 5 styles (output passes the receiver's validators; random-match rules enforced); the real `main.js` end to end as host and guest of a private match (decline, accept, two games), as a random searcher that hosts (cancel then restart, stranger accepted, safe lobby, photo styles disabled, photo pushes refused) and as a random searcher that joins (skips empty and full slots).
- Verified on a device: nothing yet. Not exercised: the real camera and hand model, WebRTC between two phones, how anything looks on screen.
- Open:
  - Make the repo public and enable GitHub Pages (user action), then try two phones.
  - Random matchmaking relies on strangers being online at the same time; with few players it will mostly say "no opponent found".
  - Gesture thresholds still untuned on real hands. No moderation or block list.

## 2026-10-26 — First complete version (NOT YET TRIED ON A REAL CAMERA OR TWO PHONES)
- Changed: new project, separate from `fingers/` (which is untouched). Two-player game: room code over PeerJS (WebRTC),
  both players use the camera each round (pointer = answer, guesser = guess, no typing), health bars, fighter
  animations, 5 arenas, critical hits for gestures, customisable seconds / hits to win / gestures on-off.
- Verified (automated, in Node on the phone, 38/38): game rules and damage table; finger counting and gesture
  detection on synthetic hands at 3 camera aspect ratios; validation of every network message (names, guesses,
  photos); every element id / import / CSS class the scripts use exists; the real `main.js` driven end to end in
  simulator mode as HOST and as GUEST against a scripted opponent, through two full games each (correct guess, critical
  hit, rematch, bad messages ignored, opponent leaving).
- Verified on a device: nothing yet.
- Open:
  - Real hands: gesture thresholds (moutza spread 22 degrees, sideways 60-120 degrees) are guesses from geometry, not tuned on real hands.
  - Two real phones over the internet (PeerJS, mobile NAT) and the camera/hand model on a phone.
  - Visual polish of fighters, arenas and animations has never been looked at on a screen.
  - Hosting: needs a public GitHub Pages repo (camera needs https).
