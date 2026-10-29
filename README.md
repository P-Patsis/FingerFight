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
| Sideways bird | middle finger up at roughly 90 degrees to the other raised fingers | 3 |

Critical gestures can be switched off in the lobby. An open palm (five fingers) is a normal five, never a gesture or filtered. All gesture detection is geometric and approximate.

## Starting a match
- **Create private match:** you get a long unique code (16 characters, about 80 bits, not guessable). **Copy code** or
  **Share link** and send it to a friend. By default you must tap **Accept** before anyone joins (switchable).
- **Join:** paste (or type) a friend's code. A shared link carries the code after the `#`, which browsers never send to any
  server, and the page removes it from the address bar after reading it.
- **Find a random opponent:** matchmaking with strangers. Strangers get generated names ("Fighter 4821"), and **no camera
  image is ever sent or shown**: phones exchange only finger data, and each phone *draws* the other's puppet hand or
  skeleton itself. A message carrying a photo is rejected, so a modified client can't push one at you.
- In a private match the host sets seconds, hits to win, critical gestures and one of 5 arenas. Both players tap
  **Enable camera**. A random match starts by itself when both cameras are on.
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
npm test                    # 64 tests, no dependencies (Node 20+)
```
The camera needs **https or localhost**. To play with someone else, host it on https (GitHub Pages) and share the match code.
Both players need internet: the hand model (about 17 MB: 9.4 MB wasm + 7.8 MB model, from jsDelivr / Google, cached by the
browser) and the PeerJS introduction server.

## Privacy and security, honestly
- The game files are public (GitHub Pages needs a public repo). They contain no secrets, photos or accounts.
- Your camera never goes to GitHub or to us. Finger data, and in private matches optionally a photo, go phone to phone over
  WebRTC (encrypted). If a direct connection is impossible, PeerJS's public relay servers (`turn:eu-0/us-0.turn.peerjs.com`)
  carry the encrypted traffic; they can't read it.
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
