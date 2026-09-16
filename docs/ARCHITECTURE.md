# Architecture

Office Futboll is a Manifest V3 Chrome extension with a Node.js WebSocket server.
The client presents server state; the server is authoritative for lobby state,
match state, player movement, possession, actions, ball physics, goals and score.

```text
Chrome action -> game.html -> src/core/game.js
                              |-- engine: Three.js infrastructure
                              |-- world: pitch, goals, stadium
                              |-- gameplay: rendered ball, players, input
                              |-- lobby / ui / audio: presentation
                              `-- network: WebSocket transport + protocol dispatch

WebSocket -> server/core/server.js
             |-- network: HTTP invite/static server + WebSocket sessions
             |-- lobby: roster, slots, ready/countdown
             `-- gameplay: match lifecycle, players, actions, cannon-es ball, tick
```

## Composition roots

`src/core/game.js` creates dependencies, starts the render loop and disposes the
network/audio systems. It contains no geometry, DOM event implementation,
WebSocket lifecycle or gameplay rules.

`server/core/server.js` creates one game state and connects transport, lobby,
simulation and HTTP services. `server/server.js` only starts this composition
root for `npm start`.

## Client ownership

`src/engine/` owns the local Three.js adapter, renderer, main scene, camera,
lights and texture helpers. `src/world/` owns the pitch, goals and static stadium.
`src/gameplay/` owns input collection and visual entities only; its ball and player
data comes from snapshots. `src/network/` owns the WebSocket connection, wire
contract and message dispatch. `src/lobby/` owns join, slot, ready and invitation
presentation. `src/ui/` owns DOM/UI rendering. `src/audio/` owns the local
Web Audio lobby theme; it receives presentation state and cannot affect gameplay.
`src/core/preferences.js` owns locally persisted volume and key preferences.

`shared/field.js` is the sole shared pitch geometry module. It intentionally
contains no speed, shot power, possession or scoring rules.

## Server ownership

`server/core/gameState.js` keeps the mutable authoritative state object. Managers
receive that object explicitly. They must not destructure mutable state values
into copies. `server/gameplay/` is the only location for simulation rules;
`ballPhysics.js` owns cannon-es world construction and bounded player-ball contact,
`actions.js` owns possession actions, `playerManager.js` owns movement, and
`matchManager.js` owns lifecycle and score reset. `simulation.js` preserves the
original 60 Hz simulation and 20 Hz broadcast cadence.

`server/lobby/` owns roster payloads, slot selection, ready state and countdown.
`server/network/` owns broadcasting, HTTP asset/invitation routes, LAN discovery,
WebSocket connection handling and WebSocket server construction.

## Dependency rules

- Modules may import inward toward shared configuration and local utilities.
  Domain modules do not import either composition root.
- The core files pass callbacks/interfaces where lifecycle boundaries meet. This
  avoids gameplay -> UI, world -> core and lobby -> transport cycles.
- Network messages pass through `src/network/messages.js`. UI receives state to
  display; it never determines goals, countdown start, score or action outcome.
- Browser globals are confined to the vendored-Three adapter and standard Web
  APIs. Application modules use ES imports instead of ordered global scripts.
- The server does not serve its own source, environment files or arbitrary repo
  paths through the invitation HTTP endpoint.

## Assets

Assets are organized under `assets/`. Current files are all pitch textures:
`assets/textures/pitch/grass_diffuse.png`, `grass_normal.png` and legacy
`grass.jpg`. The last file is retained as a source asset but is not loaded by
the current renderer. Player, ball, field markings and stadium advertising are
procedural. The lobby theme is generated locally with Web Audio; no audio or
model assets are currently present.

## High-conflict integration files

`manifest.json`, `game.html`, `src/core/game.js`, `src/core/config.js`,
`src/network/protocol.js` and `server/core/server.js` require focused changes
and review from the relevant owner. See `TEAM_OWNERSHIP.md`.
