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
