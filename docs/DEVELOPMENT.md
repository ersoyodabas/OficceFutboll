# Development workflow

Use short-lived feature branches from an up-to-date `main` branch:

```text
main -> feature/refactor-or-feature -> develop -> sync main -> test -> pull request -> review -> merge
```

Do not make long-lived personal branches the normal integration path. Rebase or
merge the current main branch before opening a pull request when the team uses
one of those conventions consistently.

Recommended names include `feature/stadium-upgrade`, `feature/player-actions`,
`feature/lobby-ready`, `feature/audio-system`, `feature/hud-redesign`,
`bugfix/invite-join`, `bugfix/ball-sync` and `refactor/network-dispatch`.

Run the checks that cover your change:

```powershell
npm run check
npm test
npm run test:browser
```

`test:browser` starts an isolated server and Chrome profile, loads the unpacked
extension, joins a second client through `/join`, checks shared lobby/countdown/
match state, movement, action, leave/reload behavior and saves screenshots under
`test-results/`. It uses the root dev dependency; run `npm install` once first.

When changing the protocol, update `src/network/protocol.js`, all producers and
consumers, `docs/NETWORK_PROTOCOL.md`, and the protocol tests in the same pull
request. Do not treat `src/core/config.js` as a source of authority for server
gameplay values.

Review the ownership document before touching a shared integration file. Keep
mechanical moves separate from behavior changes when practical; this makes
conflict resolution and regressions easier to review.
