# Pre-refactor audit and dependency map

Audit performed before moving code, 2026-09-16. Working tree was clean.

## Startup and ownership

`background.js` opens `game.html` from the MV3 toolbar action. The HTML loads
local Three.js, `field.js`, `stadium.js`, `lobby.js`, then `game.js` as ordered
classic scripts. The Node server also serves this client through an explicit
HTTP file allowlist; `/join` submits the invitee's name/server to `game.html`.

```text
background.js -> game.html -> lib/three.min.js (global THREE)
                         -> field.js (global OfficeField / CommonJS export)
                         -> stadium.js (global OfficeStadium; consumes THREE)
                         -> lobby.js (global OfficeLobby; consumes THREE)
                         -> game.js (consumes all four globals)
server/server.js -> field.js + ws + cannon-es + Node HTTP/fs/os/crypto
server HTTP allowlist -> all client scripts and three texture files
```

`game.js` (1,328 lines) owns the main scene, renderer, broadcast camera, lights,
pitch/markings/goals/walls, procedural ball and footballers, animation,
interpolation, keyboard controls, WebSocket lifecycle, protocol dispatch, join
handshake, lobby DOM, invitation/clipboard, countdown, match clock, score,
overlays, menu and local-storage preferences. Its closure hides its state from
other files, but virtually every subsystem shares that closure.

`stadium.js` owns static stands, instanced crowd, advertising, technical area and
floodlight geometry. It receives scene/field but obtains THREE globally.
`lobby.js` owns a second renderer, scene, orthographic camera, lighting, goals,
slot buttons and ResizeObserver. It receives grass material, pitch-marking and
footballer factories from game.js; these callbacks are important dependencies.

`field.js` is data, not the pitch renderer: frozen dimensions, radii, markings
and five slot anchors per team. Both simulation and graphics depend on it.

`server/server.js` (1,001 lines) owns all clients, host/ready/slot state, countdown,
match state, AI keepers, movement, possession/actions/tackles, cannon-es world,
goal/score/timer rules, 60 Hz simulation, 20 Hz snapshots, HTTP invite/static
routes, WebSocket sessions and startup banner. Only the ball is a dynamic rigid
body. Players are server-tracked points with bounded ball-contact resolution.

## State and dependency constraints

- Client session: socket, identity/team/position/slot/ready, joined/waiting,
  phase, positions, server match timestamp, join promise and connection flags.
- Presentation: entity map, ball snapshot, lobby view, countdown rAF, input
  keys, invite status timer. These must stay with their owning subsystem.
- Server state: clients, host, phase/countdown/match timestamps, score, pauses,
  world/ball, owner and possession delay. Preserve a single server state per
  server instance; moving primitive values into copied destructuring is unsafe.
- Network callbacks currently manipulate UI and rendering directly. Extract
  dispatch and supply explicit subsystem interfaces from the composition root.
- Input actions are requests; never implement possession, goals or action
  success in the client. UI countdown expiry must not start a match.
- Retain the vendored Three.js build; isolate its global behind one adapter.
  Application globals OfficeField/OfficeStadium/OfficeLobby can become imports.

## Inventory and findings

- Inspected manifest, HTML/CSS/DOM, background, all four client scripts, server
  source/test/README/package and lockfile, root README/gitignore, asset and lib
  inventories and vendored library header. No build framework or hosting config.
- `lib/three.min.js` is a vendored MIT Three.js build with its own deprecation
  notice; no remote script loading. `cannon-es` 0.20.0 and `ws` 8.21.3 are locked.
- Active textures: `assets/textures/pitch/grass_diffuse.png`, `grass_normal.png`.
  `textures/grass.jpg` is only referenced by the HTTP allowlist, not rendering.
  Preserve the file, relocate it to the pitch assets directory.
- Player/ball/ads/markings are procedural; no model or audio files. No audio
  behavior or email/SMTP exists. Do not add fake implementations for those.
- Existing join flow's finally block uses undefined `joinBtn`; correct to its
  actual `connectBtn` DOM reference during extraction.
- Existing multiplayer test passes team/position in `join` and uses
  `update_self`, but server requires explicit `select_slot`. Update tests to
  actual behavior instead of reintroducing removed message handlers.
- Countdown is **3 seconds**, despite old README/initial HTML saying 5.
  Match duration is 300 seconds, winning score 5, end pause 6 seconds.
- Some existing lobby strings contain literal question marks. Preserve rather
  than mix a translation overhaul into architecture work.
- Client render resources currently are removed without GPU disposal; retain
  behavior and record this as follow-up debt.

## Planned boundaries

Native ES modules without bundling; shared frozen field data imported by client
and server. Client core composes engine, world, visual gameplay, lobby, UI,
network dispatch and an event-driven audio extension point. Server core composes
explicit state, gameplay managers, lobby/ready managers, network transport and
HTTP invitation service. Shared callbacks resolve lifecycle interactions without
module import cycles. CSS leaves the high-conflict HTML for the UI domain.
