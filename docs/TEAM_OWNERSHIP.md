# Team ownership

Replace the placeholders in `.github/CODEOWNERS` with real GitHub usernames.
Each domain owns its internal implementation and exposes a narrow interface at
its boundary.

| Domain | Owned folders | Responsibilities | Normally avoid | Integration / required cross-review |
| --- | --- | --- | --- | --- |
| Engine | `src/core/`, `src/engine/`, `shared/` | lifecycle, state composition, renderer/camera/light adapters, shared geometry | gameplay rules, DOM copy, stadium geometry | Review world changes that require engine APIs; review all core/config or manifest changes. |
| Gameplay | `src/gameplay/`, `server/gameplay/` | rendered entities/input; authoritative movement, physics, actions and match lifecycle | UI layout, protocol spelling, static stadium | Review any message payload or shared-field change with Network and Engine. |
| World | `src/world/`, `assets/textures/`, `assets/models/` | pitch, goals, stadium, crowd, advertising and visual assets | player rules, lobby DOM, server simulation | Review if world data changes shared field geometry or needs engine APIs. |
| Lobby / Network | `src/lobby/`, `src/network/`, `server/lobby/`, `server/network/` | slot/ready/countdown, invitations, transport and protocol | renderer internals, ball physics, HUD styling | Review protocol changes with Gameplay, UI and server owner; review static hosting changes with Engine. |
| UI / Audio | `src/ui/`, `src/audio/`, `assets/audio/` | HUD, score, timer, overlays, notifications, local preferences and sound cues | simulation rules, WebSocket server, world mesh construction | Review event/message consumption with Network; request Gameplay review for new action cues. |

Shared files are `manifest.json`, `game.html`, `src/core/game.js`,
`src/core/config.js`, `src/network/protocol.js` and `server/core/server.js`.
Keep changes to them small, explain why in the PR, get the designated owner’s
review, and coordinate when another owner needs the same file.
