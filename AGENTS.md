# Citybase agent handbook

Citybase is a local repository-as-city workbench. The primary frontend is Godot
(`godot/`), backed by the Node daemon (`core/`). The React/Electron shell remains
the legacy fallback. Both reuse the CommonJS services in `electron/main/`.
Start with [docs/README.md](docs/README.md) for current requirements,
architecture, contracts, operations and release gates.

## Working rules

- Work on a feature branch and propose changes through a PR. Never push directly
  to `main`. Lint, build, tests and applicable CI jobs gate merge.
- Use the repository's squash-merge convention and conventional commit subjects:
  `<type>(<scope>)?: <lowercase imperative description>`, at most 72 characters,
  without final punctuation. `hooks/commit-msg` is authoritative. Do not use the
  global `/commit` skill, override Git identity, or bypass hooks.
- No incidental TypeScript migration, styling-system overhaul, backend/cloud
  service, or new runtime dependency without an explicit scoped justification.
- Preserve the Godot/Node split. New frontend work follows the
  [v4 charter](docs/v4-game-engine.md); do not add Electron-only product features
  without an explicit product decision.
- Keep personal machine paths, credentials and private handoffs out of commits.

## Build and verification

Use the supported Node version in `.nvmrc` / `package.json`. Commands and
prerequisites are in [README.md](README.md), and the executable procedure is
[VERIFICATION.md](VERIFICATION.md).

```sh
npm ci
npm run lint
npm run build
npm test
npm run test:coverage
npm run test:e2e
npm run test:godot  # requires Godot 4.7.2; set GODOT_BIN if needed
```

`npm test` runs once; `npm run test:watch` watches. Tests use separate Node and
jsdom projects in `vite.config.js`. Electron tests need a fresh renderer build.
The smoke can validate an unpacked app via `CITYBASE_ELECTRON_EXECUTABLE`.

## Code boundaries

- `processService.cjs` owns production Node subprocess execution. Frontends send
  registered operations, not shell commands. Tooling under `scripts/` is separate.
- Resolve workspace IDs inside the shared handler map; never accept a renderer's
  arbitrary path as an agent cwd. Keep pure factories and injected system seams.
- Maintain the Electron sandbox and authenticated loopback WebSocket boundary.
  Approval covers a complete agent run, not individual tool calls. It is not an
  OS sandbox. See [DATA_CONTRACTS.md](docs/DATA_CONTRACTS.md).
- React composes state through `src/app/` hooks and local component state; follow
  the owning hook rather than adding a second source of truth. Godot owns its
  presentation state in scene scripts. There is no external React store.
- Fixtures live in tests. The removed `src/data/seed.js` and `src/game/data.js`
  must not be restored as production fixture imports.
- Close the other frontend before using a shared profile. Concurrent cores need
  distinct profiles. The core profile lock does not lock legacy Electron.

## Development cycle

Use groom, implement (or a cohesive implement-batch), doc-sync,
protocol-v-and-v, then release when its explicit gates pass. Write trackers only
with `python .cycle/trackers.py`; see [.cycle/TRACKERS.md](.cycle/TRACKERS.md).
This personal repository uses root trackers with Jira off.

File defects before fixing them and scope features before coding. Completed
tickets reach `fixed-pending-migration` or `shipped-pending-migration`, with
`Fix` / `Implementation` and `Docs`. V&V owns migration into the append-only
`CHANGELOG.md`; partial automated checks are not a full Verified release gate.
Active trackers contain unfinished work. Earlier complete tracker text is
preserved in [docs/history/](docs/history/README.md) and Git history.

CodeRabbit is advisory. Fix substantive findings; CI is the merge gate.
