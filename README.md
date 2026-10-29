# Citybase

> An isometric IDE that visualizes a repository as a hex-tile city, where local tasks and agent runs become quests, contributors are guilds, and coding agents are the adventurers dispatched to fulfill them.

## What is this?

Citybase is a local desktop app: open a Git repository, see its folders and files as a city, dispatch an agent run, and review the changes and check results.

The v4 frontend uses **Godot 4.7** for the 3D city and workbench. It starts a local Node daemon, `citybase-core`, which handles Git operations, agent processes, approval requests, and persisted run history. The city shows real file sizes and Git status; quests come from `features.md` and `bugs.md`; XP and levels come from recorded run outcomes.

The Godot workbench currently dispatches Claude Code. The shared core also supports Codex CLI, available through the legacy Electron shell and scripted clients. The Electron shell remains in the repository while Windows export and parity work is completed. See [the v4 architecture and gate results](./docs/v4-game-engine.md).

## Prerequisites

- **Godot 4.7**, the version used for the recorded v4 validation. The commands below assume its executable is available as `godot` on `PATH`.
- **Node 24+** and **npm** for a development checkout. Node must be available on `PATH` so Godot can start the core.
- **Git** on `PATH` and a local Git repository to open.
- **Claude Code CLI**, authenticated, for runs from the Godot workbench. Confirm `claude --version` works in the terminal used to launch Citybase. Codex CLI is optional for the core and Electron adapter.
- **GitHub CLI (`gh`)**, authenticated, if you use the core or legacy shell's PR action. Confirm the account with `gh auth status`.

## Quick start

From the repository root, including on Windows with Godot and Node on `PATH`:

```bash
npm ci
godot --path godot
```

Godot starts and authenticates its own core process. A development launch restores the most recent workspace, or opens this checkout if no workspace has been saved. Use **OPEN WORKSPACE** to choose another local repository.

Each core has its own connection port, but only one core may use a state directory at a time. A second launch using that directory fails before loading or writing history. For concurrent test instances, use a separate PowerShell terminal for each and give each instance a different `CITYBASE_CORE_USERDATA` directory:

```powershell
$env:CITYBASE_CORE_USERDATA = Join-Path $env:TEMP 'citybase-instance-a'
godot --path godot
```

Use `citybase-instance-b` in the second terminal. These instances keep separate workspace lists, run histories, and XP. Closing an instance releases its profile; a later launch can also reclaim the profile after a forced process termination.

For the legacy Electron shell:

```bash
npm run dev:desktop
```

For Electron against a production renderer build, run `npm run build:desktop` followed by `npm run start:desktop`. There is no standalone browser frontend; the React renderer requires Electron's `window.citybase` bridge.

## Using the v4 workbench

1. Open a workspace. The core reads its branch, Git status, tracked file tree, and recent commits. Drag to orbit the city and use the wheel to zoom.
2. Switch to **CITY / WORK**. Select a quest from the workspace's `features.md` or `bugs.md`, or enter a prompt.
3. Click **RUN (gated)** and review the approval dialog. Approving starts Claude in the selected workspace; rejecting starts no agent process. Live events move the avatar to files the agent touches.
4. Review the outcome after the run settles: changed files grouped by district, additions and deletions, and results from the workspace's declared check scripts. Run history persists across restarts.
5. Enter a commit message and click **COMMIT** when you want to stage and commit all workspace changes. Push the branch before using the core or legacy shell's PR action; automatic pushing is not implemented.

The Godot workbench currently shows the branch but has no branch selector or PR button. Those operations remain available through the shared core and legacy shell.

## Available scripts

| Script | What it does |
|---|---|
| `npm run core -- --print-conn` | Headless core for scripted clients; prints the generated connection port and token |
| `npm run package:v4` | Packages the Godot frontend and bundled core as a macOS app (requirements below) |
| `npm run dev:desktop` | Legacy Electron shell with HMR against the Vite dev server |
| `npm run start:desktop` | Legacy Electron shell against the built renderer in `dist/` |
| `npm run build` / `build:desktop` | Production renderer build to `dist/` (alias of each other) |
| `npm run package:dir` | Unpacked dev build under `dist-electron/` (no installer, no codesign) |
| `npm run package:mac` | macOS `.app`, ad-hoc / unsigned for local dev |
| `npm run lint` | ESLint over the project |
| `npm test` | Vitest in watch mode (`npm test -- --run` for one pass) |
| `npm run test:e2e` | Playwright Electron smoke test against the built `dist/` (run `npm run build` first) |

`package:v4` currently targets **macOS arm64 only**. Run it on a Mac with Node 25.5+ (`--build-sea`), Godot 4.7, and matching Godot export templates. The script uses `GODOT_BIN` when set, otherwise `/Applications/Godot.app/Contents/MacOS/Godot`. It bundles the core with esbuild, downloads the matching official macOS arm64 Node binary, builds a core executable, exports Godot, and ad-hoc signs `build/Citybase.app`. The resulting app includes its core runtime; the agent CLIs remain external prerequisites. This pipeline does not produce a Windows distributable; Windows development runs use the source launch above.

`package:dir` and `package:mac` package the legacy Electron shell for development, without a DMG or notarization. The `electron-builder` config lives in the `build` field of `package.json`; output goes to gitignored `dist-electron/`.

**Windows Electron packaging note.** `package:dir` may require Developer Mode or an admin shell because `electron-builder` extracts a cache containing symlinks.

## Project structure

```text
godot/
  project.godot / main.tscn        v4 engine project and entry scene
  main.gd                         core lifecycle, WebSocket client, run events
  city_builder.gd / camera_rig.gd  3D city projection and camera controls
  agent_avatar.gd                 live run movement and completion animation
  workbench.gd                    quests, approvals, run outcome, commit UI
  living_layer.gd                 activity, vitals, XP, ambient animation

core/
  server.cjs                      headless daemon using the shared handlers
  rpcServer.cjs                   authenticated localhost WebSocket transport
  userData.cjs                    platform state-directory resolution

electron/
  main/
    main.cjs / ipc.cjs             legacy Electron lifecycle and IPC wiring
    ipcHandlers.cjs                handlers shared by Electron and the core
    bootPayload.cjs                initial workspace and agent detection payload
    services/
      processService.cjs           subprocess execution and streaming
      workspaceServiceCore.cjs     workspace registration and persistence
      workspaceService.cjs         Electron folder dialog wrapper
      gitService.cjs               snapshots, branches, checkout, commit
      workspaceChecks.cjs          declared workspace check scripts
      runStore.cjs / questService.cjs  run persistence and ticket-file parsing
    agents/
      AgentAdapter.cjs / CliAgentAdapter.cjs  provider contract and CLI runner
      ClaudeAdapter.cjs / CodexAdapter.cjs   provider arguments and event parsing
      agentManager.cjs             dispatch, approval gate, run registry
      detect.cjs                   PATH and install-root probes for agent CLIs
  preload/
    preload.cjs                    isolated Electron window.citybase bridge

src/
  App.jsx                          legacy React shell and view switching
  app/                             bridge, hooks, city and review models
  views/                           city, work, run history and detail views
  game/                            shared React UI and projection primitives
  tests/                           Vitest tests and in-test fixtures

scripts/
  package-v4.mjs                    macOS Godot + bundled-core packaging
```

Production views use live data. Test fixtures belong in test files or helpers under `src/tests/`; the former `src/data/seed.js` and `src/game/data.js` modules have been deleted.

## Safety model

- **Authenticated local core.** The Godot frontend talks to a WebSocket server bound to `127.0.0.1`. A session token is required before a client receives the boot payload or can call a handler.
- **Isolated Electron renderer.** The legacy shell sets `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. React accesses the shared services through the `window.citybase` bridge exposed by `preload.cjs`.
- **Registered handlers.** Both transports expose the handler map in `ipcHandlers.cjs`. Workspace-scoped operations resolve known workspace IDs before calling services.
- **Central process service.** `processService.cjs` handles subprocess execution, streaming, timeouts, and output limits for Git, workspace checks, and agent adapters.
- **Mutating Git surfaces validate before they touch the world.** `gitService.checkout` refuses unknown branches (no `-b` auto-create); `gitService.commit` rejects empty messages; both return `{ ok: false, error }` instead of throwing into the main process.
- **Approval before dispatch.** Both UIs request `approvalMode: 'ask'`. The manager waits for an explicit approval before spawning the agent; rejection starts no CLI process. Claude then runs non-interactively with `--permission-mode bypassPermissions`. This is approval for the whole run, without separate prompts for individual CLI tool calls.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "claude CLI not found on PATH" | The agent CLI is missing or cannot be found in Citybase's launch environment. | Confirm `claude --version` works, then launch Citybase from that terminal. Detection also checks common per-user install directories. |
| Claude run fails immediately with "not authenticated" | The CLI hasn't logged in yet. | Run `claude login` once in a terminal, confirm `claude --print --output-format json -p "hi"` works, then retry inside Citybase. |
| `openPR` throws "no upstream" or "branch not pushed" | The head branch hasn't been pushed to the remote; Citybase does not auto-push. | `git push -u origin <branch>` from a terminal, then call openPR again. |
| `openPR` throws "GraphQL: must have admin rights" or similar | `gh` is authenticated as the wrong account, or doesn't have permission on the remote. | `gh auth status` to inspect; `gh auth login` to re-auth. |
| `dev:desktop` hangs at "waiting for http://localhost:5173" | Vite could not bind port 5173. | Stop the conflicting process or change `server.port` in `vite.config.js` and `dev:desktop`'s `wait-on` URL. |
| Commit hook rejects "subject does not match the project convention" | Non-conventional subject. | See [CONTRIBUTING.md](./CONTRIBUTING.md). Format is `<type>(<scope>)?<!>?: <description>`, ≤72 chars, lowercase after the colon. |

## Testing & verification

`npm test -- --run` runs the Vitest suite (jsdom; the per-file baseline lives in VERIFICATION.md Stage 2). The canonical release checklist is [VERIFICATION.md](./VERIFICATION.md) — a six-stage V&V protocol covering static review, automated tests, the manual desktop walkthrough, adversarial checks, and the hard product constraints (renderer isolation, IPC allow-list, approval boundaries). Run it before any release or after any large refactor.

## Roadmap

The original phased plan lives in [ROADMAP.md](./ROADMAP.md). The Godot migration, architecture, and recorded macOS gates are in [docs/v4-game-engine.md](./docs/v4-game-engine.md). Windows packaging and parity remain unfinished; the legacy Electron shell stays available during that work.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md). Short version: AI agents propose changes via PRs; CI gates the merge.

Work is tracked in the project-cycle files: defects in [bugs.md](./bugs.md), scoped features in [features.md](./features.md), shipped/fixed history in [CHANGELOG.md](./CHANGELOG.md). File a `BUG-NNN` / `FEAT-NNN` entry before fixing or building; migrate it to the changelog when it lands. The full lifecycle is described in [AGENTS.md](./AGENTS.md).
