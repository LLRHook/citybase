# Citybase

> An isometric IDE that visualizes a repository as a hex-tile city, where local tasks and agent runs become quests, contributors are guilds, and coding agents are the adventurers dispatched to fulfill them.

## What is this?

Citybase is currently a **design prototype** wrapped in the first Electron desktop shell. The React/Vite renderer still uses mocked data, but the app direction is local-first: open one Git repository from disk, visualize it as a city, and delegate AI work to an existing harness such as Codex CLI or Claude Code.

Phase 0A stabilized the prototype with CI, tests, docs, and a centralized mock-data module. This desktop refresh keeps that architecture while adding the initial main/preload process, workspace IPC, and renderer hooks for a local Git workspace.

## Quick start

Prerequisites: Node 20+, npm, and Git ≥ 1.8.5 (released November 2013 — required for the `git -C <path>` flag the workspace service uses).

```bash
npm install
npm run dev
```

Open http://localhost:5173 for the browser prototype.

To run the Electron shell during development:

```bash
npm run dev:desktop
```

After `npm run build:desktop`, `npm run start:desktop` launches the built Electron shell.

For the current desktop prototype, Citybase defaults to opening this Citybase repository itself as the workspace when no saved workspace exists.

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run dev:desktop` | Start Vite and launch Electron against the dev server |
| `npm run build` | Production renderer build to `dist/` |
| `npm run build:desktop` | Build the renderer for Electron loading from `dist/index.html` |
| `npm run start:desktop` | Launch Electron against the built renderer |
| `npm run package:dir` | Build the renderer + package an unpacked dev build under `dist-electron/` (no installer, no codesign) |
| `npm run package:mac` | Build a macOS `.app` directory under `dist-electron/`, ad-hoc / unsigned for local dev |
| `npm run lint` | ESLint over the project |
| `npm test` | Run Vitest in watch mode; use `npm test -- --run` for a single pass |
| `npm run preview` | Preview the production renderer build locally |

### Packaging notes

`package:dir` and `package:mac` are intentionally **dev-only**: no DMG, no notarization, no codesigning identity. They produce a runnable app directory you can hand to a teammate or launch locally. Production-distribution scripts (DMG, signed/notarized macOS, Windows MSI, Linux AppImage) are deferred to a later phase.

`electron-builder` reads its config from the `build` field in `package.json`. Output goes to `dist-electron/` which is gitignored.

**Windows dev note:** running `package:*` from Windows requires either Windows Developer Mode enabled (Settings → Privacy & Security → For Developers) or an admin shell — electron-builder's first run extracts a 7z cache that contains symbolic links, which Windows refuses to create otherwise. macOS and Linux runners (including the CI image) have no such constraint.

## Project structure

```text
electron/
  main/
    main.cjs                    - BrowserWindow lifecycle and app startup
    ipc.cjs                     - allow-listed IPC handlers
    menu.cjs                    - desktop menu commands
    services/                   - workspace, Git, and process helpers
  preload/
    preload.cjs                 - isolated window.citybase bridge

src/
  App.jsx                       - top-level shell (view switching + state)
  main.jsx                      - Vite entry point
  app/
    citybaseApi.js              - renderer facade for Electron/browser API
    useWorkspace.js             - selected workspace + Git snapshot state
  data/
    seed.js                     - single mock data source; backend projections replace this
  game/
    palette.js                  - neon color tokens + alpha helper
    hex.js                      - pointy-top hex grid math
    theme.jsx                   - UI primitives
    useTweaks.js                - runtime-toggles hook
    map.jsx, kanban.jsx,
    analysis.jsx, panels.jsx,
    modals.jsx, command.jsx,
    tweaks.jsx                  - view + panel components
    data.js, sagas.js           - re-export shims sourcing from src/data/seed.js
  tests/
    setup.js                    - Vitest setup
    *.smoke.test.jsx            - RTL smoke tests against <App />

docs/
  domain-model.md               - plain-language core entities
  agent-runtime.md              - provider-neutral AgentProvider contract
```

## Architecture notes

- The renderer never gets Node.js integration. Electron uses `contextIsolation: true`, `nodeIntegration: false`, and a small preload API.
- `src/data/seed.js` is the only canonical mock-data source. Add new fixtures there, not inside components.
- `src/game/data.js` and `src/game/sagas.js` remain compatibility re-export shims.
- `palette.js`, `hex.js`, and `useTweaks.js` remain non-component modules so Fast Refresh can keep `theme.jsx` and `tweaks.jsx` component-focused.
- `vite.config.js` keeps Vitest on jsdom and uses `base: './'` so the built renderer works when Electron loads `dist/index.html` from disk.

## Roadmap

The full vision and phased plan live in [ROADMAP.md](./ROADMAP.md). Phase 0A is the stabilization baseline; the desktop shell is the next local-first slice.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md). The short version: AI agents propose changes via PRs; CI gates the merge.
