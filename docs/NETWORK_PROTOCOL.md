# Network protocol

The exact wire constants live in `src/network/protocol.js`. Message spellings
below are the current contract. Do not rename one without changing this document,
the protocol constants, client handling, server handling and tests together.

All payloads are JSON objects with a `type` property.

## Client to server

| Type | Payload | Purpose | Example |
| --- | --- | --- | --- |
| `join` | `name` | Enter the lobby; slot remains unselected. | `{"type":"join","name":"Ada"}` |
| `select_slot` | `team`, `slot` | Select a free team slot in the lobby. | `{"type":"select_slot","team":"blue","slot":4}` |
| `ready` | `ready` | Toggle readiness after selecting a slot. Sent during a countdown with `false`, it takes that readiness back and the server cancels the countdown; anything else during a countdown is ignored. | `{"type":"ready","ready":true}` |
| `input` | `x`, `z`, `sprint` | Request normalized movement. The server validates and applies it only during a match. | `{"type":"input","x":0,"z":-1,"sprint":false}` |
| `action` | `key` | Request `A`, `S` or `D` action. The server determines pass/shot/cross/tackle and success. `S` with the ball is an uncharged tap shot; `S` without it is a standing tackle. | `{"type":"action","key":"S"}` |
| `shot_charge_start` | none | S key went down. With possession the server starts timing a charged shot; without it the server treats it as a standing tackle. Extra fields are ignored. | `{"type":"shot_charge_start"}` |
| `shot_release` | none | S key went up. The server fires the charged shot using its own measured hold time (0–2000 ms). Ignored without an active charge. Any `power`/`charge`/`spin` fields are ignored. | `{"type":"shot_release"}` |
| `shot_cancel` | none | Abandon an active charge without shooting (e.g. window lost focus). | `{"type":"shot_cancel"}` |
| `leave_match` | none | Leave an active match while retaining the WebSocket lobby session. | `{"type":"leave_match"}` |

## Server to client

| Type | Payload | Purpose | Example |
| --- | --- | --- | --- |
| `lobby` | `phase`, `players`, `score`, `hostId`, `minPlayers`, `positions`, optional `countdown` | Complete lobby presentation state. | `{"type":"lobby","phase":"lobby","players":[],"score":{"blue":0,"red":0}}` |
| `welcome` | `id`, `isHost`, `field`, `positions` | Identifies an accepted socket. | `{"type":"welcome","id":"uuid","isHost":true}` |
| `slot_error` | `message` | Rejected slot/ready request. | `{"type":"slot_error","message":"Bu yeri başka bir oyuncu seçti."}` |
| `countdownStart` | `startAt`, `duration` | Authoritative start timestamp and countdown duration (`COUNTDOWN_SECONDS`, 5 s). The lobby counts the duration down from the moment the message arrives, so a client clock that differs from the server's cannot skew it. | `{"type":"countdownStart","startAt":1730000000000,"duration":5000}` |
| `countdownCancelled` | none | The countdown was stopped: a join or departure changed the line-up (everyone's readiness is cleared), or a player took their own readiness back (the others keep theirs). The following `lobby` message carries the authoritative ready flags. | `{"type":"countdownCancelled"}` |
| `matchStart` | `startedAt`, `endsAt` | Authoritative match timing. | `{"type":"matchStart","startedAt":1730000003000,"endsAt":1730000303000}` |
| `state` | `phase`, `serverTime`, `score`, `startedAt`, `endsAt`, `ball`, `players`, `goalEvent`, `outEvent`, `kickoffTeam`, `kickoffEndsAt` | 20 Hz authoritative rendering snapshot. `ball` includes angular velocity `wx`/`wy`/`wz`; each player includes `charging`, `chargeStartedAt` (server time, or `null`) and, for AI keepers, `diving`. | `{"type":"state","score":{"blue":1,"red":0},"ball":{"x":0,"y":0.18,"z":0,"vx":0,"vy":0,"vz":0,"wx":0,"wy":0,"wz":0},"players":[]}` |
| `actionResult` | `id`, `action`, `success`, `hasBall`; `shot_charge` also has `startedAt` (server time); `shot` also has `charge` (0–1), `speed`, `lift` (m/s), `aim` (−1 left … 1 right) and `spin` (rad/s) | Server result of a requested or automatic action. Charged shots add `shot_charge` (charge started) and `shot_cancel` (charge dropped, e.g. ball lost). AI keepers report `save` (held) or `parry` (deflected). | `{"type":"actionResult","id":"uuid","action":"shot","success":true,"hasBall":true,"charge":1,"speed":44,"lift":5.8,"aim":0.4,"spin":-8}` |
| `outOfPlay` | full `state` snapshot with phase `outOfPlay` and `outEvent` | The ball fully crossed a goal line outside the goal mouth or a touchline. Play is frozen for `outEvent.endsAt - startedAt` (2000 ms) while every client shows `outEvent.notice`. | `{"type":"outOfPlay","phase":"outOfPlay","outEvent":{"id":3,"boundary":"touchline","notice":"TAÇ","restart":"throwIn","lastTouchTeam":"blue","receivingTeam":"red","defendingTeam":null,"restartPlayerId":"uuid","startedAt":1730000100000,"endsAt":1730000102000,"position":{"x":21.18,"y":0.4,"z":6.2}}}` |
| `restart` | full `state` snapshot with phase `playing` and the finished `outEvent` | Authoritative restart after `outOfPlay`: the taker (`outEvent.restartPlayerId`) has been placed and owns the ball, opponents have been moved away; clients snap to it. | `{"type":"restart","phase":"playing","ball":{"x":20.3,"y":0.18,"z":6.2}}` |
| `match_end` | `score`, `winner` | Server ended the match by score or time. | `{"type":"match_end","score":{"blue":5,"red":2},"winner":"blue"}` |
| `lobby_returned` | none | Confirms a player returned to lobby UI. | `{"type":"lobby_returned"}` |

## Authority and compatibility

The client only sends intent and presents snapshots. Server configuration in
`server/core/config.js` remains authoritative for speed, cooldowns, possession,
action strength, physics, score, countdown and match length. Match time uses
server `Date.now()` timestamps; clients do not start their own clocks.

Charged shots are timed only on the server: `shot_charge_start` records the
server time, `shot_release` (or reaching 2000 ms, which fires automatically at
maximum power) computes `charge = held / 2000`, and the server derives speed,
lift, direction and sidespin from its tunables, the shooter's facing and the
left/right input held during the charge. Speed rises with charge from
`SHOT_MIN_SPEED` to `SHOT_MAX_SPEED`: 0–50 % normal (16–27 m/s), 50–80 % strong
(27–37 m/s), 80–100 % very fast (37–44 m/s). The shot leaves along the shooter's
facing; left/right input only turns it by up to `SHOT_AIM_MAX_DEG` and adds a
subtle sidespin toward the same side. There is no random sideways deviation, and
a straight shot stays around the middle of the goal. Above 50 % charge an aimed
shot is pulled toward the upper corner on that side of the goal the shooter
faces (fully at 100 %): the server solves the yaw and lift that reach the corner
target with gravity, damping and curl, and the target carries a random error
that grows with distance, so the shot can still hit the post or crossbar, go
wide or over, or be saved. A struck ball starts `SHOT_LIFTOFF_HEIGHT` above the
grass so ground friction cannot scrub its pace or bend its direction. The
client power bar has no timer, animation or smoothing of its own and does not
use the estimated server clock: when `shot_charge` confirms the charge, the bar
is anchored to the moment S was pressed (the message that started the server's
timer) and draws `shotChargeLevel(performance.now() - pressedAt)` from
`shared/shot.js`, so it reaches 100 % exactly 2000 ms after the press, when the
server fires. Only a fresh key press starts a charge (OS key auto-repeat is
ignored). Curve comes from a Magnus force applied
in the server simulation, so every client receives the same trajectory. The
flame trail on shots above 80 % charge is client-only presentation driven by the
`shot` result and the ball velocity in snapshots; it never affects physics.
Movement is also server-side: acceleration, braking, a speed-dependent turn rate
and a limited angular acceleration (slower when sprinting or charging) shape the
velocity reported in snapshots.

Goal lines and touchlines are open. Each tick the server follows the ball's path
between ticks and uses the first boundary it crossed completely. Over a goal line
it is a goal only if it crossed between the inner faces of the posts and below
the crossbar underside. Posts and crossbars are physical cylinders in the
simulation, and AI goalkeepers have a limited reach (body, dive, height) instead
of a catch radius. The brief loose-ball window after a kick only stops the
kicker (or the keeper after its own parry or distribution) from playing the ball
again; it never blinds a keeper to a shot.

Out of play, the server decides everything from its own last-touch record:

| Boundary | Last touch | Notice | Restart | Taker and position |
| --- | --- | --- | --- | --- |
| Touchline | either team | `TAÇ` | `throwIn` for the other team | Nearest outfield player of the receiving team, on the touchline where the ball left (kept `RESTART_EDGE_MARGIN` from the corners), facing into the pitch. No outfield player: `keeperRestart` by its goalkeeper. |
| Goal line | attacking team | `AUT` | `goalKick` for the defending team | Defending goalkeeper, `GOAL_KICK_DISTANCE` in front of its goal; attackers are moved out of the box. |
| Goal line | defending team | `KORNER` | `corner` for the attacking team | Nearest attacking outfield player at that corner (else `keeperRestart`). |

Opponents are moved at least `RESTART_OPPONENT_DISTANCE` from the ball. While
the phase is `outOfPlay` the ball is frozen and no boundary check runs, so a
restart can never produce a second out event. If the chosen taker leaves during
the pause, the server chooses again when the restart happens.

`/join` is an HTTP invitation handoff, not a WebSocket message. It submits the
server address and invitee name to the same `game.html` client used by the
extension, then that client sends `join` normally.

## Goal presentation and kickoff

`goal` and `kickoffReset` are server-to-client only. Both carry the same complete
world snapshot as `state`, including the updated score. There are no new client
commands and no client-provided scoring fields are consumed.

- `goal`: phase is `goalCelebration`; the ball and players have stopped at the
  goal scene. `goalEvent` contains `id` (monotonically increasing for this server
  process), `teamId`, `teamName`, `teamLogo` (relative to `assets/`), nullable
  `scorerId`/`scorerName`, `tauntIndex` (index into `shared/goalTaunts.js`, so all
  clients show the same line), `score`, `startedAt`, `endsAt`, and goal `position`.
- `kickoffReset`: phase is `kickoff`; `ball` and `players` already contain the
  authoritative reset. `kickoffTeam` is the conceding team, `hasBall` identifies
  its taker, and `kickoffEndsAt` is the server's resume deadline.
- `outOfPlay` / `restart`: see the tables above. `outEvent` IDs increase for the
  server process; clients show the notice (`AUT!!!`, `TAÇ!!!` or `KORNER!!!`,
  with the restart type underneath) once per ID, seeked by
  `serverTime - startedAt`, and hide it when play resumes.
- `state`: continues at 20 Hz in `playing`, `goalCelebration`, `kickoff` and `outOfPlay`.
  It retains the latest `goalEvent` until the match ends so missing one-shot
  events can be recovered without replaying the animation. A joining connection
  also receives an immediate snapshot after welcome/lobby messages.

The server moves `playing -> goalCelebration` for four wall-clock seconds, then
`kickoff` for 800 ms, then `playing`. No physics or input/actions run in either
pause phase. Winning-score and time-expired goals receive the same four-second
presentation followed by `match_end`. The existing match clock keeps running.

Clients deduplicate by goal ID, seek animations using `serverTime - startedAt`,
and wait for the server's reset/resume snapshot. Animation completion cannot
resume gameplay. Reset snapshots snap visual entities to the server positions;
the camera eases toward midfield. New connections keep the existing waiting-lobby
policy and can see the goal overlay without being added to the ongoing match.
