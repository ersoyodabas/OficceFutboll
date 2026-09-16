# Ofis Futbolu 3D

Manifest V3 Chrome extension client and server-authoritative Node.js/WebSocket
football game for a LAN. Three.js renders the client; cannon-es simulates the
authoritative ball on the server.

## Project structure

```text
assets/                 textures, future audio and models by purpose
shared/field.js         shared frozen pitch geometry only
src/core/               client composition, client state and configuration
src/engine/             local Three.js adapter, renderer, scene, camera, lights
src/world/              field, goals and stadium visuals
src/gameplay/           visual ball/player entities and input requests
src/lobby/              joining, slots, ready state and invitation presentation
src/network/            WebSocket client and wire protocol
src/ui/                 HUD, timer, countdown and styles
src/audio/              independent audio cue boundary
server/core/            server composition, state and configuration
server/gameplay/        authoritative match, player, action and physics logic
server/lobby/           roster, slots, ready and countdown logic
server/network/         WebSocket and HTTP invitation/static services
docs/                   architecture, ownership, development and protocol docs
```

`game.html` loads only local code: vendored `lib/three.min.js` and the native
module entrypoint `src/core/game.js`. `background.js` opens that page from the
extension toolbar. The server’s `/join` endpoint serves the same client for a
shareable invitation flow.

## Running the client

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this repository root.
4. Click the extension icon, enter a server address and name, select a slot and
   press **HAZIRIM**.

The default address is a convenience value only; successful addresses are saved
locally. Use `ws://<LAN-IP>:3000` for another machine on the same LAN.

## Running the server

```powershell
cd server
npm install
npm start
```

The server listens on `0.0.0.0` and prints localhost and discovered LAN WebSocket
URLs. `PORT=4000 npm start` changes the port; in PowerShell use
`$env:PORT=4000; npm start`. Open the matching inbound TCP firewall port when
other devices need to connect.

## Multiplayer model

Clients send join, slot, readiness, input and action requests. The server owns
the lobby, countdown, players, ball physics, possession, actions, goals, score
and match timing. It broadcasts the same lobby state, countdown timestamp,
match timestamp and snapshots to every client. The countdown is currently 3
seconds; a match ends at five goals or five minutes.

Controls: arrow keys move relative to the broadcast camera; `W` sprints; with
the ball, `A` passes, `S` shoots and `D` crosses. Without possession, `S` is a
standing tackle and `D` is a sliding tackle. `Esc` opens the match menu.

The **Ayarlar** button in the lobby, HUD and match menu controls general volume,
the original lobby stadium theme, and every keyboard binding. Defaults are 50%
for both volume controls. Changes are stored locally in the browser and apply
immediately; lobby music stops when a match begins.

## Development

```powershell
npm install
npm run check
npm test
npm run test:browser
```

Use short-lived `feature/`, `bugfix/` or `refactor/` branches and open a pull
request from an up-to-date branch. See [development workflow](docs/DEVELOPMENT.md),
[architecture](docs/ARCHITECTURE.md), [team ownership](docs/TEAM_OWNERSHIP.md)
and the [network protocol](docs/NETWORK_PROTOCOL.md).
