# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The canonical instructions live in [AGENTS.md](./AGENTS.md) — they apply to every coding agent (Claude, Codex, Gemini, Aider, local models). This file adds the command reference, the architecture map, and Claude-specific notes.

## Read first

- **[AGENTS.md](./AGENTS.md)** — project rules, commit convention, where state and mock data live, what's in/out of scope
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — PR workflow and commit format the hook enforces
- **[ROADMAP.md](./ROADMAP.md)** — phased plan and DoD
- **[docs/domain-model.md](./docs/domain-model.md)** — plain-language entity definitions
- **[docs/agent-runtime.md](./docs/agent-runtime.md)** — provider-neutral `AgentProvider` contract
- **[bugs.md](./bugs.md) / [features.md](./features.md) / [CHANGELOG.md](./CHANGELOG.md) / [VERIFICATION.md](./VERIFICATION.md)** — project-cycle trackers; lifecycle rules are in AGENTS.md § Project-cycle files

## Commands

```bash
npm install            # also activates the commit-msg hook via core.hooksPath
npm run dev:desktop    # Electron shell with HMR (Vite on :5173 strictPort + electron --dev)
npm test -- --run      # full Vitest suite, single pass (bare `npm test` enters watch mode)
npx vitest run src/tests/App.smoke.test.jsx   # run one test file
npm run test:e2e       # Playwright desktop smoke (needs a fresh `npm run build` first)
npm run lint           # ESLint over the project; zero errors and zero warnings expected
npm run build          # production renderer build → dist/
npm run start:desktop  # Electron against the built dist/ (run build first)
```

There is **no browser-only path**: the `dev` / `preview` scripts were removed; the renderer always runs inside Electron.

`package:dir` / `package:mac` are dev-only packaging (no signing/installer); on Windows they need Developer Mode or an admin shell. The release checklist is [VERIFICATION.md](./VERIFICATION.md) — run it before any release; the test-count baseline lives in its Stage 2.

## Architecture

Citybase is a two-process Electron app with a hard security boundary between the tiers:

- **Renderer** (`src/`, React 19, ESM `.js`/`.jsx`) — sandboxed: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (set in `electron/main/main.cjs`). It never touches Node APIs.
- **Main process** (`electron/`, CommonJS `.cjs`) — owns all native capability: file dialogs, git, process spawning. `child_process` is contained to `electron/main/services/processService.cjs`; nothing else spawns.

**The bridge.** The renderer's only path to the main process is the typed `window.citybase` object exposed by `electron/preload/preload.cjs` (namespaces: `app`, `workspace`, `git`, `checks`, `agents`, `menu`). Every channel is a `citybase:*` invoke handler built by the pure factory `createIpcHandlers` (`electron/main/ipcHandlers.cjs`) and registered in `ipc.cjs`. Handlers validate ids and never accept arbitrary command strings. When adding a capability, extend the factory + preload surface — never expose raw `ipcRenderer`.

**The renderer facade.** Renderer code imports `citybaseApi` from `src/app/citybaseApi.js`, never `window.citybase` directly. The facade is a thin re-export of the bridge and **throws on import when the bridge is missing** — the browser stub was deliberately removed because it masked real bridge failures. Tests inject a fake `window.citybase` in `src/tests/setup.js`.

**The agent layer.** `electron/main/agents/` implements the provider-neutral `AgentProvider` contract (seven methods, defined in `docs/agent-runtime.md`): `CliAgentAdapter` is the shared base, `ClaudeAdapter` / `CodexAdapter` wrap the local CLIs via `processService`, `agentManager` orchestrates runs and the approval flow, `detect.cjs` finds installed binaries, `resolveProvider` picks the adapter. Run events stream to the renderer over a single agent-event channel. The UI must never branch on a specific provider — Claude is the v1 default adapter, not a hard dependency.

**State.** All UI state lives in the `CitybaseApp` component in `src/App.jsx`; a single `view` value switches `'city'` / `'work'`, and children receive props (no external store yet — Zustand is planned for a later phase). Persistent state is `workspaces.json` + `runs.json` in Electron `userData` (`workspaceService` / `runStore`); there is no database.

**Fixture data.** There is no seed module anymore — `src/data/seed.js` was deleted when the renderer went fully live-data (the city is projected from real Git state; run history comes from `agentManager.listRuns()`). Test fixtures live in the test files or a shared helper under `src/tests/`, never in production renderer code.

**The headless core (v4).** `core/server.cjs` serves the same `citybase:*` handler map as JSON-RPC over a token-gated loopback WebSocket for non-Electron frontends (the Godot app in `godot/`). Both frontends share one brain, one approval boundary, and one `userData` state dir — see [docs/v4-game-engine.md](./docs/v4-game-engine.md).

**Testing pattern.** The whole suite (Vitest + React Testing Library, jsdom) runs without booting Electron because main-process code is deliberately split into pure modules with injected dependencies — `windowConfig.cjs`, `ipcHandlers.cjs`, `workspaceChecks.cjs` take their system boundaries (electron app, services, fs, processService) as parameters. Keep this pattern when adding main-process code: pure logic in its own `.cjs` module, the `require('electron')` glue kept thin. Tests live in `src/tests/`; the Playwright desktop smoke lives in `e2e/` (`npm run test:e2e`, FEAT-001).

**Vite specifics.** `base: './'` in `vite.config.js` is load-bearing — the built renderer must work when Electron loads `dist/index.html` from disk. Port 5173 is strictPort because `dev:desktop`'s `wait-on` depends on it.

## Claude Code specifics

### Use `gh` for PR / CI work
The repo has GitHub remote and the user has `gh` authenticated. Read PR status, CI checks, comments, and reviews via `gh` rather than the GitHub web UI or unauthenticated `curl`. On Windows the binary lives at `/c/Program Files/GitHub CLI/gh.exe` — invocations of that path are pre-allowed in [.claude/settings.json](./.claude/settings.json) for the common read-only subcommands.

### Commit hooks are live
Every `git commit` runs through [hooks/commit-msg](./hooks/commit-msg). Claude Code sessions also trigger [.claude/hooks/validate-commit-msg.sh](./.claude/hooks/validate-commit-msg.sh) as a `PreToolUse` Bash hook. **Don't invoke the global `/commit` skill** — it writes commit subjects as the literal branch name, which the hook rejects. Use `git commit -m "<type>: ..."` directly per the format in CONTRIBUTING.md.

### CI is the merge gate, CodeRabbit is advisory
- CI in `.github/workflows/ci.yml` runs lint, build, test on every push and PR. All three must pass before merge.
- CodeRabbit comments on every PR ([.coderabbit.yaml](./.coderabbit.yaml) configures it). Its comments are **advisory** — no `request_changes_workflow`. Treat findings as signal but the merge gate is CI.
- The Docstring Coverage pre-merge check is disabled because the project rule is "default to writing no comments."

### Squash-merge convention
Phase 0A and the commit-discipline PRs were squash-merged so the granular branch commits collapse into one main-branch commit. Use the same approach for future PRs unless there's a reason to preserve interim history. `gh pr merge <N> --squash --subject "<conventional subject>"`.

### Don't introduce
- TypeScript migration as a side effect (planned later phase)
- Tailwind, CSS-in-JS, styled-components, design system swaps
- Storybook, backend, database — see ROADMAP.md for phase boundaries
- New runtime dependencies without justification in the PR
