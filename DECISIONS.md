# Finger Fight: decisions

## 2026-11-06 — Gesture-powered cosmetic effects and a compact preview workspace

- Keep only the custom colour picker in the toolbar; put hand fitting beside it, and Original reset inside the picker. Put labelled icon controls inside the preview rather than below it. Replace misleading Store Snapshot with a true camera toggle. Mirror Customise's sticky preview/categories + horizontal items layout in Store; move the equipped stack/Clear all below the items.
- Implement charge/release as a local graphics state machine on the existing tracking loop, not a new gesture/counting model or network field. Hold a fist, debounce, build power, then release on any deliberately extended finger (including one/two-finger floor choices). Cancel on lost tracking, reduced-motion or camera stop, and reset on skin/element changes.
- Give Sand warm Earth-style tiles and extra dust while preserving existing shake/reassembly and particle accounting. Water/Fire/Earth/Air and other skin families get themed charging/release feedback, with no extra timers, dependencies, copyright art or particle-cap exceptions. Share current live tile geometry where coordinate identity is valid; snapshots recompute their own geometry.
- Canvas-exported review images and proxy-context CPU timings are useful checks, not substitutes for actual Android/browser screenshots and FPS. Keep those phone checks explicitly open.


## 2026-11-06 — Local practice is not a stranger match

- Restrict camera views only for random online matches. Local computer practice may show the player's own camera and local result JPEG; never start a peer for this. Keep private incoming-photo display preferences separate from local practice pictures, and use honest local-only hints.
- Remove idle intensity UI and ignore old saved intensity; use max 10/10 with existing reduced-motion/frame-rate protections. Keep Fire intensity separate.
- Store is for acquiring unowned items; Customise is for selecting and styling owned items. Filter using the existing Inventory.owns rules on every Store grid refresh, remove obtained cards immediately, preserve rejected unlocks, and provide a direct owned-collection button. Do not change the demo unlock provider or add monetisation.


## 2026-11-06 — Compact hand fitting controls

- Hide Finger width, Palm width, Coverage and Reset fit behind an initially collapsed **Adjust Hand Size** disclosure. Preserve its open state during editing rerenders; leave the fitting values, live camera path and validation unchanged.


## 2026-11-06 — Package the existing game with Capacitor

- Use current Capacitor 8 and bundled local web assets on secure https://localhost, retaining the existing rig/MediaPipe version/P2P game. Do not point a production wrapper at a remote server.url. Keep model/assets offline-capable and native updates APK-based; PWA updates remain independent.
- Capacitor is the Android container/plugin bridge. Cloudflare is a separate optional backend host; building the APK does not require deploying accounts/social services. Native passkeys need their own verified origin/Digital Asset Links integration before accounts can be enabled.
- Keep the debug app separate with .debug applicationId, stable ignored project-local keystore, no microphone permission and no device/network discovery. Camera shutdown uses the existing pagehide path; resume nudges reconnect. Hardware Back preserves existing room-leave confirmation.
- Build in project-local SDK/cache directories with Java 21, Gradle 8.14.3, SDK 36, one worker/1 GB heap and a pinned project-local ARM aapt2 35.0.2 override (the older shared binary cannot read SDK 36 resources). Do not change shared build tools. Compile success is separate from real-phone permission, camera, peer/reconnect and FPS acceptance.


## 2026-11-05 — Paired reductions and backend deployment gate

- Simplify match setup to one Arena carousel and independent scrolling Music inside a collapsed Match settings disclosure. Always approve private joins. Put shared Customise/Try on and editor Try on/Stop camera/Done under the preview; keep camera controls explicit and comfortably sized.
- Reduce per pair after the opening four rounds so both players use the same cap: 5/5/5/5, 4/4, 3/3, then 2. At that floor disallow zero; never silently turn a detected fist into one finger. Computer chooses one appearance per match.
- Implement the backend as portable Worker/D1 modules with a Node/SQLite development adapter and a maintained passkey verifier; keep server dependencies out of the frontend. Sessions/challenges/authorization/rate limits and real crypto verification are required. Server match commits prevent post-disclosure changes; do not claim camera anti-cheat or import local/solo wins.
- Respect the declined Cloudflare account lookup. Build/test locally and leave API_URL empty until deployment is approved and verified. Gate leaderboard UI until authenticated peer matching, server result use and reconnect/cancellation are wired into live matches. No fake online-account status or production backend claim. backend/README.md records the concrete remaining steps.


## 2026-11-05 — Reuse customiser and match loop for local computer practice

- Reuse the shared Profile/try-on editor from lobby and final results. Preserve the room/result on return, signal not-ready during editing, and restore readiness/camera handlers before playing. Keep the editor before/between matches so it cannot consume an active round's camera or countdown. Re-arm random autostart after editing.
- Computer is an explicit local practice mode, not a fake remote player. Choose answer and RNG guess before seeing the human snap, use the current shrinking limit, randomise the bot puppet and reuse the ordinary game loop. No signaling service, native build, extra model or new dependency. Store practice statistics separately; they cannot feed player leaderboards.
- Expose only an inactive ad-space label under the result carousel. Advertising integration is a separate decision.
- Keep accounts optional/guest-first. Record a concrete social plan rather than shipping nonfunctional friends/report/invite buttons. Real identity, moderation, invitations/push and shared standings need backend authorization and operational ownership; current P2P counts are not cheat-proof ranked results. See SOCIAL_PLAN.md for staged scope and primary references.


## 2026-11-05 — Default two lives, shrinking finger limit after round four

- New match defaults are 2 hits/lives, 5 fingers and shrink enabled. Interpret “after round 4” as round 5 reducing to 4, round 6 to 3, round 7 onward to 2. Keep custom host settings, explicit Off and limits already below the floor.
- Use the existing round-start overlay for the exact **Fingers reduced to X** notice, promoted to its primary text, with the round as secondary text. Announce only an actual change; preserve the separate reconnect badge and existing round timing. Both peers derive the limit/notice from synchronized settings and round number.


## 2026-11-05 — Manual fit before automatic edge estimation

- Expose independent finger fatness and palm width, plus a small coverage margin for edges/tips. Defaults reproduce existing proportions. Keep compact controls in Hand, persist locally, and provide Reset fit.
- Apply fitting to drawing/mask geometry only; never change tracking coordinates, facing or scoring. Preserve finger mount positions and lengths when changing fatness; fit accessories on the same matrices. Procedural elements and cloak masks must share the preference.
- Send optional validated bounded `fit:{f,p,c}` metadata so proportions match in received stills. Omit defaults and ignore receiver preferences when incoming data lacks fit. Add no new inference/model/readback loop; automatic fitting remains a separate future step requiring phone performance/edge testing.


## 2026-11-05 — Camera-derived hand isolation and procedural materials

- Correct the prior mode interpretation: Puppet-only Ghost/Chameleon means camera-derived pixels INSIDE the hand, with the rest hidden, not cartoon fallback art. Photo + puppet retains the full camera scene. Clamp effect alpha to the current hand mask so temporal feathering cannot leak the surroundings; show the current real hand where Ghost has no learned background. Existing non-photo peer payloads remain image-free.
- Counter selfie mirroring for comic glyphs and mirror event positions once in photo/wire snapshots. Palm-relative size/placement is preferable to large screen-relative bursts. Queue stable counts through word cooldown; include initial and decreasing counts, zero and ten. No permanent finger labels.
- Replace Elemental's recoloured segmented body with material-specific geometry while preserving the accessory rig. Water is rounded connected fluid volumes; Earth is explicit source tiles; Fire is layered flame tongues; Air is filaments without a solid glove. Use the same procedural material geometry for static pictures. Share Earth tile geometry between source, detached chunk and spring target.
- Inspect rendered states before delivery. A simple local rasterizer supports visual inspection without installing a browser/system package; it is not evidence of phone/GPU fidelity. Cap and soften air wakes after reviewing their clutter.


## 2026-11-05 — Element-specific motion response

- Water uses liquid deformation, on-body currents and momentum/gravity droplets; Air uses historical free-space wakes. Do not reuse hand-following orbit rings as both materials.
- Keep material physics drawing-only and bound spring/velocity state; preserve all original landmarks for counting/facing. Reuse caller update/draw and existing particle cap, including worn items. Static peer snapshots do not gain physics state.
- Earth sheds independently randomized chunks with local source-part loss and expanding dust, preserving its palm core. Remove the timed whole-hand dissolve; leave the separate Sand skin's shake/reassembly unchanged.
- Fire momentum and lean respond to hand speed/direction, with world-space released particles. Air wakes retain their birth centres and expire instead of following the hand. Increase shedding with movement for all elements, within shared caps.
- Review actual rig/particle states as a vector artifact and report CPU costs separately from unmeasured camera/GPU/phone FPS.


## 2026-11-05 — Camera mode boundary correction

Ghost and Chameleon respect the selected view: **Puppet only** hides the camera, uses authored puppet art and never samples/draws Vanish textures. **Photo + puppet** explicitly enables the camera scene and Vanish background replacement/adaptation. Leaving that mode clears cached image/model buffers. This supersedes the earlier local-camera exception for puppet-only mode. Outgoing ordinary puppet pictures remain data-only.


## 2026-11-05 — Respond to phone feedback on effects

- Use a bounded grid for compact category controls; a range must shrink within its parent.
- Comic callouts are brief motion/extension events in screen space, never constant finger labels. Send only max-two strict label/position records with a picture; opponents remain still snapshots.
- Give Elemental spatial presence using shared capped particles and stream arcs; Earth reuses Sand collapse/reform and the same pool, without changing landmarks or scoring.
- Local Ghost/Chameleon puppet views show the camera behind the composite. Ghost substitutes actual learned room pixels and leaves unlearned areas alone. Chameleon deliberately approximates the room with slow phased coarse triangular colours. No puppet body covers these effects; accessories remain.
- Start Vanish at 320 px and adapt downward on sustained slow samples, retaining the learned background. Keep <=10 Hz sampling and local-only camera data. This supersedes the previous tinted/translucent 160 px treatment. Device appearance and readback cost remain unverified.

## 2026-11-05 — Nails, generic comic/elemental art and Vanish reuse

- Rename only the Nails category label, retaining layer/id/storage compatibility. Use one saved 0–10 length preference, with checked optional `nl` on pictures; default 5 stays omitted. Scale authored nail tips about their mounts and knuckle blades about their palm anchor; keep metal sleeves fixed. Zero removes nail layers from the draw recipe. Paw intrinsic claws share the preference. Check authored oversized-item fitting points and transform them using the real rig matrices.
- Redesign animal claws as keratin talons; add a thumb to Scissor fingers and a separate free generic Knuckle claws item with three large palm-mounted metal blades. Preserve back-only nail/polish policy and both-side projecting claws. Keep the selected base hand/ownership when Clear all removes worn layers; move it above the list for discoverability.
- Hotdog: use stable per-finger curve variation, per-finger spring response and small time-based flutter rather than frame-by-frame random positions. Choose a stable sag side near vertical to prevent tracker-noise flips. Warm tan is the new authored default; saved explicit colours remain untouched.
- Comic: count/word starbursts use the existing tracking count or validated finger-state data; never infer a score from the puppet. Original generic ink/halftone art and POW/BOOM/ZAP labels only. Leave normal skeleton annotations unchanged.
- Elemental: one generic hand id with four enum modes (Water, Fire, Earth, Air), generated ordinary shapes and existing capped particles. Persist locally and send checked `el`; Fire reuses the fire-intensity control. No branded characters, logos or trademarked hand names.
- Adapt the user's Vanish background/engine code (dc529d777ee45b447a6599299db6b5c46cdaf32d). Reuse existing hand landmarks as the mask, avoiding another inference model. Limit camera readback to 160 px long edge and 10 updates/s; learn even when the hand leaves, reset on camera/skin changes and release all pixel buffers on pause. Vanish cannot invent a background never observed; use surrounding colour until learned.
- Chameleon/Ghost camera textures remain local. Stranger puppet snapshots remain safe authored vector hands, not textures or photos. Existing opt-in private photo modes retain their JPEG rules and can include the local composite. Preserve masks/temporal smoothing without a new timer/stream; report pixel math separately from unmeasured camera readback/GPU cost.
- Ship a static vector review sheet and require phone review of cloak edges, large blades, hotdog dynamics and comic/elemental styling. The bounded JS benchmarks are not evidence of real camera FPS or successful raster appearance.

## 2026-11-05 — Correct facing from phone feedback, retract Paw claws, compact controls

- The previous label inversion put nails on palms on the user's phone. Use handedness labels directly against raw camera landmarks (`LABEL_MIRRORED=false`), separate from CSS display mirroring. Preserve stable-side hysteresis and existing `bk` snapshots; do not reverse each nail item individually. Allow validated per-shape `side` metadata so Cartoon's built-in nail lines follow the same back-only policy.
- Move Paw's static claws into five dynamic tip overlays using the existing finger-extension rig. They show/project from either side, shrink/hide on curl, and ride extension endpoints; counting remains based on the original landmarks.
- Remove redundant idle/Painting help and arena/music parentheticals; make slider label/range/value a single non-wrapping row with a shrinkable input. Keep accessible range labels and existing persistence.
- Category switching resets new content after rebuild: horizontal/top position in the card container and vertical screen alignment beneath sticky category controls. Keep Store filters visible and do not reset scroll merely for equipping/colour changes.

## 2026-11-04 — Material pass, local idle strength and world-space Sand

- Use bounded normal rig paths for material shading/glints, not shaders, images, gradients or extra particle emitters. Polish 23 metal, glove, nail/ring and Sand assets while retaining base silhouettes, draw order, side policy, dynamic extensions and colour roles. A final idempotent authoring pass is easier to maintain than rewriting every historical generator.
- Add a local saved 0–10 idle-strength preference in the Hand category. It scales existing shape animation, with 0 still and 5 default, and affects existing camera dynamics immediately. Do not send it: opponent pictures remain still. Reduced motion overrides it. Fire intensity and shake/spring physics remain separate controls/behaviours.
- Replace Sand's live landmark-relative scatter with bounded world-space grain state. Release inherits measured hand velocity; drag/gravity and a small curl act in flight; critically damped springs return grains to current homes. Substep at <=16 ms, clamp frame delta, and reset distant/changed-partition grains. Keep the original shake/calm thresholds and 84 shared-grain/90-total/6-emitter budgets.
- Dissolve Sand by part (tip, mid, base, palm), apply that alpha to worn layers too, and update body/swarm in the same frame. Reassembly reverses the dissolve, returning palm first. Still pictures and reduced motion draw the complete static texture.
- Provide a static vector review sheet from the actual rig and animation transforms. It supports art review but cannot establish real-camera appearance, browser raster cost or motion feel. Report JS-only timings separately and require phone review for the material/physics look.

## 2026-11-04 — Follow-up interactions and thumb-web root

- Swap the menu positions of Profile & settings and Store.
- Painting rerolls on its owned tile/large fitting-preview click and on entry into a deliberate fist. Debounce closure and reopening at 150 ms, latch while closed, and never treat a missing hand as a fist or reopening. Regenerate only at the gesture transition, from the existing tracked count. Keep the generated seed in the existing validated `sd`; simulator snapshots now carry generated parameters too.
- Add a shared saved 1–10 Fire intensity control for Flaming/Burning Bone, stronger default 7. Keep the 90-particle/6-emitter and per-emitter limits; increase coverage through bounded particle size as well as spawn rate. Carry optional validated integer `fi` so opponent stills use the sender's intensity. Reduced motion remains the static authored flame look.
- Root all webs at finger bases, with thumb CMC (landmark 1) to index MCP (5), rather than the earlier shallow thumb-MCP root. Keep tucked-thumb and palm-boundary checks. More distal reach improves thumb/index coverage while open; photos remain the authority for visual tuning.
- Broader Sand/all-cosmetic polish is an idea list for a later visual pass, not an unreviewed catalogue rewrite in this interaction change.

## 2026-11-04 — Camera idle animation, generated-colour cache, web and skin fixes

- Keep cheap idle shape transforms running at the camera's tracking cadence even below 20 fps. The existing `HandCam` render path already advances/passes the clock; the bug was `HandDynamics` freezing it at the spring-physics cutoff. Reduced motion freezes both; slow frames still disable springs. No second inference pass or animation loop, and opponent snapshots remain still.
- Cache recolours by source object identity with weak ownership. Geometric levels and Painting seeds share ids but differ in geometry; a cache keyed only by id/colour returned an earlier variant. Keep the existing validated `gc`/`sd` fields and slider persistence.
- Add a guarded thumb-index web to Frog/Duck. Require the distal thumb outside the wrist-index boundary and an extended index, then require the whole shallow membrane outside the thumb-MCP/index-knuckle palm edge. Hide ambiguous poses rather than crossing the palm. No extra wire fields or landmark edits.
- Remove the static preview face sway and its exported clock/constants. The fixed pose starts on the back; camera tracking supplies real orientation.
- Burning Bone reuses Flaming's four emitters and static flame treatment over clean bones. Sand reserves 84 of the 90 particle slots for its shared swarm, uses curved staggered dispersal and longer easing, and trims shed particles when necessary. Six emitters remain the cap. All art is generic; generators reflect the new design.
- Automated render-path checks and JavaScript timings cannot verify phone rasterisation, camera feel or visual quality. Camera animation, Burning Bone, Sand and thumb web need device review before calling their appearance verified.

## Current implementation (reviewed 2026-10-30)

This file contains dated history; later decisions supersede earlier ones. Current source/tests establish:
- Only correct guesses score; no-hand rounds miss, with a separate three-round idle-forfeit rule.
- Default max fingers 5; shrinking cap optional/off. Open palm is a normal five.
- ExpressTURN configuration is present in `js/ice.js`; the relay list is not empty. Random ICE is relay-only; private ICE allows direct/fallback. See [TURN_REVIEW.md](TURN_REVIEW.md).
- Lobby auto-setup, explicit Camera test and Store/Profile try-on can access the camera in addition to guess windows. Hidden page and flow cleanup release it. Opening Profile alone does not start try-on.
- Cosmetics use an ordered stack (maximum 12 items), with colours/effects and local ownership; payment/ad unlocks are stubs.
- Canonical repository is P-Patsis/FingerFight; the old FingerRing local remote is unchanged.
- Current rules: `js/logic.js`; lifecycle: `js/main.js`/`js/hands.js`; ICE: `js/net.js`; tests: `tests/`.

## Historical decisions (superseded where noted above)

- **Separate project from `fingers/`.** That app is a single page counting fingers; this one reuses its counting logic (in `js/gestures.js`, now aspect-ratio aware) and the same MediaPipe CDN setup.
- **Web app on GitHub Pages, PeerJS (WebRTC) for the room code.** No server of ours. The camera needs https, hence Pages. PeerJS is bundled (`vendor/`, 1.5.4, 93 KB); MediaPipe stays on the CDN (about 17 MB once per player).
- **Both players use fingers.** Pointer's count = the answer; guesser's count = the guess (0 = fist, no hand seen = no guess = a miss). Photos from both sides are shown at the reveal.
- **Original damage rules (superseded):** critical hits and single-round no-hand damage were removed. See the current implementation above and `resolveRound`/`trackIdle`.
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
- **Historical relay setup (superseded; configuration is now present in js/ice.js).** The PeerJS default TURN hosts are dead (no DNS), and no free relay works without an account. Random matches hide the IP through a relay, so without one they are refused with an explanation rather than hanging or silently exposing the IP. Do not paste a TURN credential into chat logs; it is public once it is in the page, so use a revocable one.
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


## Desktop hardening, hidden feed, warning (2026-10-29)
- Drawn views (skeleton, puppet) hide the live camera picture entirely rather than blur it: nothing of the room is rendered, and it is cheaper. Photo views keep it. Chosen over a blur because a blur still draws video every frame.
- The camera warning is derived from the view (`cameraWarning`), never from the picker's position, so it cannot sit under a drawn option.
- A failing tracking loop stops after 40 consecutive errors and says so; a failing puppet degrades to the skeleton. Visible error beats a hang.

## Playtest polish (2026-10-29)
- DEFAULT MAX FINGERS is 5 (one hand): quicker, and the shrink floor of 3 then has room to work. The host can still raise it to 10.
- FEWER FINGERS: the ceiling drops by 1 after every 5 rounds, floor 3, never above the host's limit; the change is announced when it happens. Chosen over every 2 rounds, which shrank too fast to feel fair.
- The camera starts by itself in the lobby (one try per room, no hidden retries). A failure shows a button and the reason; the lobby never waits for it. The camera is still off outside the guess window.
- The match-code box is not sticky: a floating box over the settings was the problem; the join request is the thing that floats, because the host must act on it.
- The profile preview never uses the real camera: photo views are a stand-in picture, so opening Profile cannot turn the camera on.
- Top bars (Back/Leave) are transparent and let taps through; only the button itself is drawn.

## Layered cosmetics and the Store (2026-10-29)
- COSMETICS ARE LAYERS ON THE EXISTING RIG, AS DATA: base hand (a skin), tone, tattoo, nails, ring, glove, each a JSON item mapped onto the same 16 named parts. No rig change beyond "draw these extra shapes per part after the base". Spec: COSMETICS.md.
- FREE STACKING, ORDERED BY Z ONLY. Nothing blocks a combination (ring over glove is allowed by giving the ring a higher z); default z puts gloves over rings over nails. One item per layer slot (simple equipment model, simple wire format).
- Tone is a colour remap, not a separate hand, so it needs no art per tone and only applies where a base uses those colours. A premade whole hand is a finished piece and is never recoloured.
- Particles are named presets in code, items only pick one and its parameters, so an item (or a future downloaded one) cannot carry script. Hard caps, no own loop, off under reduced motion, driven by the tracking loop that already exists. Opponents get a still snapshot (their picture is a still anyway); animating the reveal was not worth the fps risk.
- Only item ids travel (`cos`), the receiver draws from its own copies. Cosmetics are allowed in random matches: they are drawn data, same rule as the skin id.
- Ownership is a local flag (localStorage), not a security boundary: acceptable for a friendly game and for the stub. Real purchases will need a provider that verifies receipts (server side) before it says granted.
- MONETISATION IS STUBBED, ON PURPOSE. All unlocks go through ONE function and ONE replaceable provider (js/unlock.js). The web app contains no ad SDK, no payment processor and no related network code; the native build installs a real provider. Labels say "(demo)" while the stub is active. The end screen only reserves an empty slot for a future banner.
- The Profile skin picker shows owned hands only; the Store is the one place to see and unlock everything.

## Cosmetics UX overhaul (2026-10-29)
- THE EQUIP MODEL IS AN ORDERED STACK, NOT TYPED SLOTS. Tap order = draw order (last worn on top), several items of one type allowed, each item once (tap again removes it), max 12. Chosen over fixed z per type because players wanted "I tapped glove then ring" to mean ring over glove, and multiples (several rings). The base hand stays single and the bottom; the skin tone stays single (a hand has one colour). `LAYER_Z` and the item `z` field were removed rather than kept as a second, conflicting ordering.
- REORDER WITH ARROWS (▲ ▼ ✕), NOT DRAG AND DROP: 40 px tap targets are reliable on a phone; drag handles inside a scrolling page fight the scroll and need pointer-event code that cannot be tested here. Tap order sets the first order, arrows change it.
- TAP-TO-TOGGLE: the card is the control; locked cards only have their unlock button. The Wearing card (preview, list, reorder, colour, Test snap) is ONE shared element moved between Store and Profile, like the style card, so the two screens cannot drift apart.
- COLOUR IS DATA ON THE ITEM (`tint`): colours used in the file are mapped to roles (main / dark / mid / light) and one picked `#rrggbb` produces all of them. Items that differed only by colour were collapsed (6 tones -> `skintone`, 3 nail polishes -> `nailpolish`) and their old ids migrate to item + colour (`LEGACY_ITEMS`). Only exact `#rrggbb` is ever stored or sent; the locked colour variants (orc, frost, black, neon) became free colours: the colour itself is no longer worth selling, a future paid item should be a different SHAPE or effect.
- WIRE: `lay` (ordered `[{id, c?}]`, max 12) and `bc` replace `cos`. `cos` is still accepted and drawn so a not-yet-updated phone does not drop pictures, but this version does not send it. Validation is strict (exact keys, ids, `#rrggbb`); a bad picture is dropped.
- EFFECTS ARE ITEMS (`layer: effect`): same equip/stack/colour mechanics, they only contribute emitters, so the 90-particle / 6-emitter caps, reduced-motion rule and the "inside the tracking frame, no loop of its own" rule apply unchanged. Added one preset (`bubbles`). On the opponent's reveal they remain a still snapshot.
- TRY-ON REUSES THE EXISTING CAMERA CLASS AND THE SHARED CAMERA VIEW: Test snap loads the model, starts the camera in the Wearing card and draws puppet + worn items over my own live picture. Local only. It is switched off by `show()` (any screen change), the page-hidden handler, the camera being lost, or the Camera off button; a start still pending when the screen is left is cancelled (token + the camera's own generation counter). Every failure writes its reason into the card.

## 2026-11-01 — Profile restructure decisions
- **Colour is per category, not per item.** One colour (or gradient) for all tattoos, one for nails, one for effects, one for the hand, one for skin tone; stored as `ff-catstyle` and copied onto each worn entry, so the wire format stays per entry and old phones/receivers need no new concept. Rings and gloves keep their authored colours.
- **Gradients are solid mixes, never CSS.** Two `#rrggbb` stops (`c`, `d`); each rig part gets one plain mixed colour by its place across the hand; particles pick from a small palette. The receiver decides where a gradient applies (not skin tone, not rings), so a modified sender cannot widen it.
- **Intensity cannot exceed the caps.** `k` 1-10 only scales rate/burst/size within the authored limits (40/s, 30); `ParticleSystem` still caps 90 live particles and 6 emitters, whatever any sender asks for.
- **Customise = camera on, leaving = camera off.** The camera is tied to the Customise button and the Profile screen, not to opening the Profile. The lobby never gets this mode (its camera belongs to the match).
- **Static preview turns, it does not spin.** A 2D rig has no real back side: the "back" is the mirrored front without nail polish. Honest approximation until there is back-of-hand art.
- **User-made hands reuse the skin format and parser** and are stored locally; they never travel as data (only the id does, and a receiver without that hand draws the default). Creating them is a later build.

## 2026-11-01 (3) — try-on follows the chosen view; sound follows page focus
- The try-on is no longer separately switchable: a photo view (Photo + puppet / + skeleton) shows my live camera picture behind the puppet, any other view shows the puppet alone on the dark background. The puppet is always drawn because the items are what is being tried.
- Sound pauses with `AudioContext.suspend()` when the page is hidden, blurred or put away, and resumes when visible and focused. One switch pauses music, loops and effects together and keeps the music position; mute/volume state is never touched.

## 2026-11-01 (4) — nail side, arena music, stats
- **Facing is measured, not guessed.** Palm vs back comes from the landmarks' turn direction plus MediaPipe's hand label (swapped, because the frame is not mirrored). It is computed where the camera is (the sender) and sent as `bk`; a receiver cannot re-derive it from landmarks alone (a left palm and a right back look the same in 2D). Unknown = draw everything (no regression for the simulator and older pictures).
- **Sides are item data.** Nail polish is always the back; other items say `side` (default both). A tattoo on the palm only shows when the palm faces the camera.
- **Music is its own setting.** `settings.music` (0-4) beside `settings.background`; presets set both. Old clients (no `music`) fall back to the background's own track, so mixed versions still work.
- **Favourite number = most SHOWN** (the finger count held up as the pointer); the most-guessed total is shown too, as "Favourite guess". Stats never leave the phone.

## 2026-11-01 (5) — preview, colour picker, sticky zone
- The top window answers "what will my opponent see?" (the selected view); the puppet fitting answers "what am I wearing?" and is a separate pane that appears only when the top window cannot show the items.
- Colour: kept presets AND a full picker (not picker-only): presets are one evenly spread row (hue steps of 30 degrees), everything else is the native picker. The gradient switch sits first in the panel and is the only way to a second stop.
- The preview zone is sticky only while customising, inside the card, and capped at 30vh so the items stay reachable on a short screen.

## 2026-11-01 (6) — one-line colour picker, no gradients, no skin tone, sticky top block
- **Gradients removed.** One plain `#rrggbb` per category. Saved gradients keep stop A; `d`/`bd` stay *accepted* by the validators (an updated phone must not reject a not-yet-updated one) but are ignored and never stored or drawn. Chosen over deleting the fields from validation, which would have broken mixed-version matches.
- **Skin tone category removed; the Hand colour recolours the hand.** Colour is per hand (`ff-hcolors`), so switching hands never tints a neon hand with the cartoon skin colour. Hands without a `tint` (robot, paw, premade) say so instead of showing a dead picker. The old skin-tone colour migrates to the cartoon hand. Rings and gloves were given tints so every chip has a picker.
- **One picker above the grid**, switching with the chip; presets cut to 11 basic colours on one line. The Hand category shows a hint instead of duplicating the hands that live in "Choose your Hand".
- **Single-preview rule** (the double-preview bug): live camera showing the selected view > swaying puppet (puppet view, camera off) > static view picture (skeleton view, camera off). Never two panes. The old second "puppet fitting" pane beside the live camera is gone.
- **Sticky top block** = preview, Choose your Hand, colour picker, chips (preview capped at 24vh so short phones keep room for the cards); only the item cards scroll under it. Done (camera off) is a small corner button in the preview. Item groups and Choose your Hand are horizontal scrolling rows.

## 2026-11-01 (8) — skeleton styles, saved looks, favourites
- **Skeleton styles are code, not catalogue items.** They are only a way to draw 21 joints, so they live in `layers.js` / `drawBones` with an id list; the wire field `ss` is validated by shape (1-12 lower-case letters), not against the list, so a newer phone's style never gets a picture refused (unknown = Classic). One shared colour, as asked ("the picker applies to the selected style").
- **Hands moved into the Hand category** and the lobby lost its hand/skeleton rows: customising lives in one place. The lobby keeps the view choice only.
- **Looks are plain data re-validated on every read and apply**, using the same cleaners as the network (stack, colours, intensity, style id). A look can never wear a locked or unknown item or exceed the stack limit.
- **Favourites replace the "remembered lobby choice".** The lobby override is for that match only; the old `ff-bg`/`ff-music` values seed the favourites once. Default song is "none" so existing players do not suddenly get menu music.
- **App-wide scene = the existing #stage.** Match screens (lobby, game, result) keep their own background/music; every other screen uses the favourites. The page-focus pause works on the whole audio context, so it covers menu music too.
- **Scroll reset after the rebuild** (and snap off for a moment): setting scrollLeft before replacing the cards was re-snapped by the browser.

## 2026-11-02 (10) — in-app colour picker, editable looks
- **Hand-built picker instead of the native input.** The native input always pops the browser's own dialog (unstyleable, and an extra step). A hue slider + saturation/brightness square is ~60 lines of maths (colorpick.js) and no dependency. Chosen over a wheel: two simple controls are easier to use with a thumb and need no trigonometry on touch. The panel floats (absolute) so the sticky block keeps its height; Done is optional because dragging already applies live, and an untouched Done changes nothing so opening the picker can never silently set a colour.
- **No change to what is stored or sent**: the picker only ever produces `hsvToHex` output, which then goes through the same `cleanColor` / validators as every other colour.
- **Looks: one ✎ per look, actions in a strip** rather than three buttons on every chip, to keep the pinned row compact. Update keeps id, name and position so a look is tweaked in place.


## 2026-11-02 (13) — generated hands, hue-shift, webbing
- **Hands drawn by a program (`js/generated.js`)**: Geometric (`gc`) and Painting (`sd`). The program only emits an ordinary skin that goes through the same `parseSkin` checks, so the wire carries just a validated integer that picks the shapes, never shape data. Same number = same hand on every phone. Chosen over sending skins or images: tiny, safe, deterministic.
- **Painting seed**: each phone makes its own at match start and sends it with every picture, so no extra message or agreement step is needed; the opponent draws my painting from my seed.
- **Hue-shift instead of "no picker" for fixed-colour hands**: rotate hues relative to the hand's dominant hue and gently tint greys, so the design stays but the colour is the player's. Per-hand memory reuses `ff-hcolors`.
- **Webbing as side fins on finger segments**: parts can only draw in their own space, so a true membrane between two parts is impossible in the format. Fins ride the fingers and meet when fingers are close; wide spread leaves gaps. A real membrane needs a rig extension.
- **Hotdog fingers**: width and overshoot are the only levers the format gives; length stays bound to the landmarks.


## 2026-11-02 (14) — ad-locks only, membrane, extension, sand
- **No money in the app.** `purchase` is removed from the valid unlock methods and no item data carries a price; every locked item is an ad-lock. Chosen over keeping "Buy" as data that the UI hides, so a future change cannot quietly re-add a paid path. `js/unlock.js` stays the one replaceable provider (ad SDK later).
- **Web = a skin-level membrane computed from landmarks**, not shapes in a part's space. A part can only draw in its own space, which is why fins gapped; the membrane needs two fingers' landmarks, so the rig builds it (`webGeometry`) and the skin only says colours, `reach`, `scallop`. Gaps: three (no thumb).
- **Fingers past the tip = repeat the hand's own links, droop in screen space.** The extension re-uses the worn hand's `_mid`/`_tip` shapes, so it matches any hand and any recolour with no extra art, and an item (`longfingers`) needs no shapes. Droop turns toward screen-down (that is what a viewer reads as gravity). It is drawing only; counting reads landmarks and never the rig.
- **Sand's swarm lives inside the particle system**, so the 90/6 caps are enforced in one place (a swarm of 60 + shed grains <= 90). Shake detection needs a SUSTAINED spike (0.15 s) so one bad tracking frame cannot crumble a hand. No wire change: opponent pictures are stills.

## 2026-11-02 (15) — dynamic items, length-awareness, hook hand, physics, idle animation
- **Dynamic = squash toward a pivot + hide with hysteresis**, driven by a per-finger stretch measured from the landmarks (not by the finger-count code). Flicker was the side flag flipping, so the side is held for 6 frames and the "shown" flag has an on/off gap. Chosen over smoothing the drawing alone because the flag itself was the problem.
- **Length-aware by re-targeting shapes, not scaling art**: tip shapes ride the last extension link, mid shapes the real tip and inner links. No item needs two versions.
- **Hook as a hand with dynamic overlays** (not an item): the brief wanted one hook per raised finger, which is exactly "an overlay per tip that follows the finger".
- **Physics is a spring chain with projected velocity**, in the live loop only. A position-constraint integrator that kept the constraint's velocity exploded on a one-frame jump; dropping the along-link velocity keeps links rigid and stable.
- **Idle animation is data on shapes (`anim`) with a clock held by `HandDynamics`**; stills never animate; reduced motion and slow phones freeze it. Generated hands animate without consuming random numbers, so the same seed still gives the same hand on every phone.
- **Flame uses the existing particle system at its cap** (4 emitters of the 6, ~112/s) rather than a bigger budget; the static look covers reduced motion.
- **Removed**: Chrome skeleton (hand), Blade fingers (became Long claws; old id mapped), old nails-item hook (now a hand).
