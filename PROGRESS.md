# Finger Fight: progress

Newest first.

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
