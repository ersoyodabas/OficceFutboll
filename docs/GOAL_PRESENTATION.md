# Cinematic goal presentation

The existing server goal detector now starts a four-second presentation before
the authoritative kickoff reset. The score changes exactly once, on the server.

## Flow and protocol

- Existing `phase` values are extended with `goalCelebration` and `kickoff`:
  `playing -> goalCelebration (4 s) -> kickoff (800 ms) -> playing`.
- New server messages: `goal` and `kickoffReset`. Both include a complete world
  snapshot. Periodic `state` messages now include phase, server time, active goal,
  kickoff team and resume deadline. No client commands were added.
- Physics and gameplay input/actions stop during both pause phases, while
  synchronization, connections and leaving a match continue normally.
- The server tick advances absolute deadlines. Clients never reset gameplay
  based on an animation or local timer. Goal IDs prevent duplicate presentation;
  snapshots recover missed events and seek late animations to their elapsed time.

## Scorer and kickoff

Server-owned possession, shots/passes/crosses, tackles, saves and low ball
contacts record touches. The last attacking player is credited; a defensive
deflection preserves that credit. Established opposing possession clears stale
attacking credit. Unknown scorers stay null, and their name row is omitted.

The reset clears ball position/velocity/spin/forces, possession, player movement,
input, cooldowns and temporary actions. Formation placement reuses
`placeAllPlayers`. The nearest human on the conceding team takes kickoff from
the centre; ties use player ID. An AI keeper is the solo-play fallback. A taker
who departs during the kickoff hold is replaced before resumption. Scores,
timestamps, teams, player identities and lobby sessions remain intact.

## Presentation and camera

A single reusable DOM overlay supplies dark layers, original team badges,
dominant GOAL typography, scorer/team text, authoritative score and animated
lines. CSS transform/opacity animations enter, hold and fade out over four
seconds; reduced-motion preferences are supported. Badges load once, with team
initials beneath them for absent or failed images. Team metadata lives outside
gameplay rules.

The existing Three.js camera eases toward the goal with a modest FOV change,
then toward midfield after the reset. The scene and renderer are reused.
Reset snapshots snap rendered entities directly to their authoritative positions.
The existing audio manager plays cached goal/whistle clips; `crowd_goal` and
`goal_presentation` are optional hooks with no required assets.

## Files changed

| Area | Files |
| --- | --- |
| Shared metadata | `shared/teams.js`, `shared/matchPhases.js` |
| Badges | `assets/teams/team-blue.svg`, `assets/teams/team-red.svg` |
| Server state/composition | `server/core/config.js`, `server/core/gameState.js`, `server/core/server.js` |
| Server gameplay | `server/gameplay/matchManager.js`, `simulation.js`, `snapshot.js`, `ballTouches.js`, `actions.js`, `ballPhysics.js`, `playerManager.js` |
| Server transport | `server/network/messageHandler.js` |
| Client protocol | `src/network/protocol.js`, `messages.js`, `goalSequence.js`, `session.js` |
| Client composition | `src/core/game.js`, `src/core/gameState.js` |
| Camera/rendered entities/input | `src/engine/camera.js`, `src/gameplay/ball.js`, `players.js`, `controls.js` |
| UI/lobby/audio | `src/ui/goalPresentation.js`, `goalPresentation.css`, `hud.js`, `src/lobby/lobby.js`, `src/audio/audioManager.js`, `game.html` |
| Tests | `server/test/simulation.test.js`, `protocol.test.js`, `goal-presentation.test.js`, `scripts/browser-smoke.js` |
| Documentation | `docs/ARCHITECTURE.md`, `docs/NETWORK_PROTOCOL.md`, this report |

## Verification

- `npm test`: authoritative scoring, freeze/action rejection, scorer attribution,
  duplicate suppression, deadline/reset/resume, snapshot recovery, identical
  messages across real WebSockets, kickoff ownership, solo AI fallback,
  departed taker, match end, abort and existing lobby/ready/invitation behavior.
- `npm run check`: syntax, imports/exports, dependency cycles, DOM/asset references
  and extension entrypoint.
- `npm run test:browser`: extension and HTTP invitation clients, actual server
  goals, shared score/event, repeated goals, scorer omission, real image-decode
  failure fallback, stable DOM reuse, desktop/narrow layouts, leave/rejoin and
  persistent settings. No browser errors; existing vendored Three.js emits its
  pre-existing deprecation warning.
- Screenshots: `test-results/goal-extension.png`, `goal-invite.png`,
  `goal-mobile.png` (local verification artifacts).

## Assumptions

- Default display names are MAVİ FC and KIRMIZI FC, configurable in team metadata.
- The existing five-goal win limit and running match clock remain unchanged.
  A winning or time-expired goal finishes its presentation, then ends the match
  instead of starting another kickoff.
- Reconnecting players retain the existing new-session/waiting-lobby behavior;
  they receive the active sequence and overlay without joining an ongoing team.
  Identity/session restoration is outside this feature.
- Original SVG badges follow the project's existing asset-serving support.
  No additional image generation, audio files or dependencies are required.
