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
| `ready` | `ready` | Toggle readiness after selecting a slot. | `{"type":"ready","ready":true}` |
| `input` | `x`, `z`, `sprint` | Request normalized movement. The server validates and applies it only during a match. | `{"type":"input","x":0,"z":-1,"sprint":false}` |
| `action` | `key` | Request `A`, `S` or `D` action. The server determines pass/shot/cross/tackle and success. | `{"type":"action","key":"S"}` |
| `leave_match` | none | Leave an active match while retaining the WebSocket lobby session. | `{"type":"leave_match"}` |

## Server to client

| Type | Payload | Purpose | Example |
| --- | --- | --- | --- |
| `lobby` | `phase`, `players`, `score`, `hostId`, `minPlayers`, `positions`, optional `countdown` | Complete lobby presentation state. | `{"type":"lobby","phase":"lobby","players":[],"score":{"blue":0,"red":0}}` |
| `welcome` | `id`, `isHost`, `field`, `positions` | Identifies an accepted socket. | `{"type":"welcome","id":"uuid","isHost":true}` |
| `slot_error` | `message` | Rejected slot/ready request. | `{"type":"slot_error","message":"Bu yeri başka bir oyuncu seçti."}` |
| `countdownStart` | `startAt`, `duration` | Authoritative absolute start timestamp and countdown duration. | `{"type":"countdownStart","startAt":1730000000000,"duration":3000}` |
| `countdownCancelled` | none | A new join or departure invalidated ready state. | `{"type":"countdownCancelled"}` |
| `matchStart` | `startedAt`, `endsAt` | Authoritative match timing. | `{"type":"matchStart","startedAt":1730000003000,"endsAt":1730000303000}` |
| `state` | `phase`, `serverTime`, `score`, `startedAt`, `endsAt`, `ball`, `players`, `goalEvent`, `kickoffTeam`, `kickoffEndsAt` | 20 Hz authoritative rendering snapshot. | `{"type":"state","score":{"blue":1,"red":0},"ball":{"x":0,"y":0.18,"z":0,"vx":0,"vy":0,"vz":0},"players":[]}` |
| `actionResult` | `id`, `action`, `success`, `hasBall` | Server result of a requested or automatic action. | `{"type":"actionResult","id":"uuid","action":"shot","success":true,"hasBall":true}` |
| `match_end` | `score`, `winner` | Server ended the match by score or time. | `{"type":"match_end","score":{"blue":5,"red":2},"winner":"blue"}` |
| `lobby_returned` | none | Confirms a player returned to lobby UI. | `{"type":"lobby_returned"}` |

## Authority and compatibility

The client only sends intent and presents snapshots. Server configuration in
`server/core/config.js` remains authoritative for speed, cooldowns, possession,
action strength, physics, score, countdown and match length. Match time uses
server `Date.now()` timestamps; clients do not start their own clocks.

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
  `scorerId`/`scorerName`, `score`, `startedAt`, `endsAt`, and goal `position`.
- `kickoffReset`: phase is `kickoff`; `ball` and `players` already contain the
  authoritative reset. `kickoffTeam` is the conceding team, `hasBall` identifies
  its taker, and `kickoffEndsAt` is the server's resume deadline.
- `state`: continues at 20 Hz in `playing`, `goalCelebration`, and `kickoff`.
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
