# Finger Fight: progress

Newest first.

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
