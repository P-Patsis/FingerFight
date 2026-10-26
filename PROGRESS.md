# Finger Fight: progress

Newest first.

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
