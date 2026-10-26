# Finger Fight

A two-player fighting game where you guess how many fingers your opponent is holding up. Built from the
finger-counting camera app: your phone's camera counts your fingers (MediaPipe hand tracking), and the other
player's phone does the same. Phone-to-phone over the internet with a 4-letter room code.

## How a round works
1. One player is the **pointer**, the other is the **guesser**. Roles swap every round.
2. A countdown starts (default 5 s). The pointer holds up fingers (both hands count, 0 to 10). The guesser
   **shows their guess with their own fingers**. No typing.
3. At 0 both phones snap a photo and count. The pointer's number is the answer, the guesser's number is the guess.
4. **Right guess:** the guesser hits the pointer (1 damage).
   **Wrong guess + an obscene gesture from the pointer:** the pointer lands a **critical hit** on the guesser.
   **Wrong guess, no gesture:** a miss. **Hiding your hand** as the pointer forfeits the round (free hit).
5. First to run out of health loses. Health = "hits to win" (default 3).

| Gesture (pointer only) | How it is detected | Critical damage |
|---|---|---|
| Middle finger | only the middle finger is up | 2 |
| Moutza | all five fingers up and fanned wide | 2 |
| Sideways bird | middle finger up at roughly 90 degrees to the other raised fingers | 3 |

Critical gestures can be switched off in the lobby. The camera can't tell a palm from the back of a hand, so
"moutza" means "open hand, fingers spread" either way. All gesture detection is geometric and approximate.

## Play
- Host: **Create room**, then **Share link** (or tell the 4-letter code). Set seconds, hits to win, critical
  gestures and one of 5 arenas. Both players tap **Enable camera**, then the host taps **Start fight**.
- Guest: open the link (the code is filled in) or type the code, then **Join**.
- No camera? Add `?sim=1` to the address to set the hand by tapping (also how the tests drive the game).

## Run it locally
```
scripts/start.sh            # serves http://localhost:8082 (use ?sim=1 for no camera)
npm test                    # 38 tests, no dependencies (Node 20+)
```
The camera needs **https or localhost**. To play with someone else, host it on https (e.g. GitHub Pages) and
share the link. Both players need internet: the hand model (about 17 MB: 9.4 MB wasm + 7.8 MB model, from
jsDelivr / Google, cached by the browser) and the PeerJS introduction server.

## Privacy
Photos and numbers go straight from phone to phone (WebRTC) and are shown for a moment, never stored or uploaded.
The public PeerJS server only introduces the two phones (it sees the room code and IP addresses). Some mobile
networks block direct phone-to-phone connections; the game then says it could not connect (a TURN relay would fix
that but needs a server).

## Layout
`js/logic.js` rules + message validation, `js/gestures.js` finger/gesture geometry, `js/net.js` PeerJS link,
`js/hands.js` camera + MediaPipe (and the simulator), `js/fighters.js` artwork, `js/audio.js` sounds,
`js/main.js` screens and the round state machine, `vendor/peerjs.min.js` (PeerJS 1.5.4, bundled).
