# Citybase

> An isometric IDE that visualizes a repository as a hex-tile city, where local tasks and agent runs become quests, contributors are guilds, and coding agents are the adventurers dispatched to fulfill them.

## What is this?

Citybase is a local-first desktop app: open one Git repository from disk, see it as a city, dispatch a Claude Code run from the UI, and review the result without staring at raw diffs.

The v1 path runs Claude Code inside the IDE end-to-end. Codex CLI is wired through the same provider contract as a fallback adapter.

## Prerequisites

- **Node 20+** and **npm** for the renderer / Electron build.
- **Git ≥ 1.8.5** — the workspace service uses the `git -C <path>` flag (released November 2013).
- **Claude Code CLI** on `PATH`, authenticated. Citybase shells out to `claude --print --output-format json …` for non-interactive runs. Install per [docs.claude.com](https://docs.claude.com/en/docs/claude-code/overview) and confirm `claude --version` works in a terminal.
- **GitHub CLI (`gh`)** on `PATH`, authenticated, if you intend to use the PR-creation surface. `gh auth status` must show a logged-in account.
- **Codex CLI** is optional in v1. If installed, it's available as an alternative adapter; if not, Citybase falls back to Claude.

## Quick start

```bash
npm install
npm run dev:desktop    # Electron shell with HMR against the Vite dev server
```

For a one-shot launch against the production build:

```bash
npm run build:desktop && npm run start:desktop
```

**There is no standalone-browser path.** The renderer always runs inside Electron — `citybaseApi.js` throws on import when `window.citybase` is missing instead of silently degrading to a stub. The browser-only `dev` and `preview` scripts were removed on 2026-05-10.

## What v1 does

A normal session looks like this — every step is real activity, not seeded data:

1. **Launch.** The main process restores the most recent workspace and runs `detectAgentBinaries()`. Both results are pushed to the renderer over the `BOOT_PAYLOAD_CHANNEL` before App.jsx mounts, so the UI lands populated with no extra clicks.
2. **Open a workspace** if one isn't already restored: `File → Open Workspace…`. The Git service reads branch, status, file tree, and recent commits via `git status --porcelain=v2` / `git log` / `git ls-files`.
3. **Pick a branch** in the top-bar selector. CHECKOUT runs when the workspace is clean; if it's dirty the selector shows a "commit first" pill instead.
4. **Dispatch an agent.** The IPC handler resolves the right `AgentProvider` adapter (`auto` prefers Claude when installed) and starts a real `claude` process inside the workspace cwd. `streamEvents` yields the parsed JSON envelope as a real `AgentEvent`.
5. **Review on the Analysis screen.** The right column shows real CI checks, a real diff (parsed from `git diff --unified=3`), and a Run History panel listing every agent run started in the current session. The empty state says "no runs yet · dispatch an agent" — no seeded reports.
6. **Commit.** With dirty files, the COMMIT RESULT card opens. Type a message; the action runs `git add -A && git commit -m`, then `git rev-parse HEAD` for the new hash.
7. **Open a PR** by pushing the branch yourself, then calling `agents.openPR` from the UI. The adapter shells out to `gh pr create --title --body --base --head` from the run cwd and parses the URL out of stdout.

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev:desktop` | Electron shell with HMR against the Vite dev server |
| `npm run start:desktop` | Electron against the built renderer in `dist/` |
| `npm run build` / `build:desktop` | Production renderer build to `dist/` (alias of each other) |
| `npm run package:dir` | Unpacked dev build under `dist-electron/` (no installer, no codesign) |
| `npm run package:mac` | macOS `.app`, ad-hoc / unsigned for local dev |
| `npm run lint` | ESLint over the project |
| `npm test` | Vitest in watch mode (`npm test -- --run` for one pass) |

`package:dir` and `package:mac` are dev-only — no DMG, no notarization, no signing. `electron-builder` config lives in the `build` field of `package.json`; output goes to gitignored `dist-electron/`.

**Windows dev note.** Running `package:*` from Windows requires Developer Mode (Settings → Privacy & Security → For Developers) or an admin shell — `electron-builder`'s first run extracts a 7z cache containing symlinks, which Windows refuses to create otherwise.

## Project structure

```text
electron/
  main/
    main.cjs                       BrowserWindow lifecycle + did-finish-load boot push
    ipc.cjs / ipcHandlers.cjs      typed IPC handlers (workspace, git, agents, checks)
    bootPayload.cjs                pure factory for the BOOT_PAYLOAD_CHANNEL message
    menu.cjs / menuTemplate.cjs    desktop menu + commands
    windowConfig.cjs               BrowserWindow defaults
    services/
      processService.cjs           guarded execFile runner (argv arrays only, cwd pinned)
      workspaceService.cjs         workspace pick / restore / persist
      gitService.cjs               getSnapshot / getBranches / checkout / commit
      workspaceChecks.cjs          runs declared npm scripts as CheckResult[]
    agents/
      AgentAdapter.cjs             the AgentProvider contract base class
      CliAgentAdapter.cjs          shared CLI-wrapping implementation
      ClaudeAdapter.cjs            real claude flags + JSON-result streamEvents
      CodexAdapter.cjs             same shape, codex CLI
      agentManager.cjs             registry + dispatcher + run history
      detect.cjs                   PATH probe for claude / codex / gh
      parseUnifiedDiff.cjs         git diff parser
      constants.cjs                AGENT_EVENT_CHANNEL + BOOT_PAYLOAD_CHANNEL
  preload/
    preload.cjs                    isolated window.citybase bridge

src/
  App.jsx                          top-level shell + view switching
  app/
    citybaseApi.js                 renderer facade — desktop bridge re-export (throws if missing)
    useWorkspace.js                workspace + Git snapshot state
    useAgentDetect.js              hook reading the boot payload, IPC fallback
    useApprovalRequests.js         pending-approval channel for write-capable runs
    useRunHistory.js               Run History data via agents.listRuns
  data/
    seed.js                        test fixtures only — not imported by production paths
  game/
    palette.js / hex.js            non-component primitives (Fast Refresh-safe)
    theme.jsx                      UI primitives
    useTweaks.js                   runtime-toggles hook
    map.jsx, kanban.jsx,
    analysis.jsx (RunHistoryPanel,
      CommitResultCard),
    panels.jsx, modals.jsx,
    command.jsx, branchSelector.jsx,
    tweaks.jsx                     view + panel components
    data.js                        slim re-export (SKILL_DEFS / hpFromContext / fmtTokens)
  tests/
    setup.js                       Vitest setup
    *.test.{js,jsx}                unit + smoke tests under jsdom
```

## Safety model

- **No shell access from the renderer.** `webPreferences` sets `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer talks to the main process only through the typed `window.citybase` object exposed by `preload.cjs`.
- **Allow-listed IPC channels.** Every channel in `ipcHandlers.cjs` validates inputs (workspace ids must be known, paths must resolve under workspace root) and returns plain serializable objects. The renderer can never pass arbitrary command strings.
- **`processService.run` is the single execFile site.** Argv arrays only — no shell strings, no string concatenation. cwd is required and pinned to a workspace path. Timeouts and max-buffer caps are enforced.
- **Mutating Git surfaces validate before they touch the world.** `gitService.checkout` refuses unknown branches (no `-b` auto-create); `gitService.commit` rejects empty messages; both return `{ ok: false, error }` instead of throwing into the main process.
- **`--permission-mode bypassPermissions` is used only for non-interactive Claude runs** so the CLI doesn't hang waiting for an approval surface that doesn't exist yet. When the renderer's approval routing lands, this flips to `auto` or `default` and prompts pump through `useApprovalRequests`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "claude CLI not found on PATH" | `claude` isn't installed, or Citybase was launched from Finder on macOS without the right `PATH`. | Install per Anthropic's docs, then relaunch Citybase from a terminal so it inherits the right `PATH`. The processService augments `PATH` with `/opt/homebrew/bin` and `/usr/local/bin` on macOS but won't find a binary that lives somewhere else. |
| Claude run fails immediately with "not authenticated" | The CLI hasn't logged in yet. | Run `claude login` once in a terminal, confirm `claude --print --output-format json -p "hi"` works, then retry inside Citybase. |
| `openPR` throws "no upstream" or "branch not pushed" | The head branch hasn't been pushed to the remote. v1 deliberately doesn't auto-push — that side effect is deferred to v1.1. | `git push -u origin <branch>` from a terminal, then call openPR again. |
| `openPR` throws "GraphQL: must have admin rights" or similar | `gh` is authenticated as the wrong account, or doesn't have permission on the remote. | `gh auth status` to inspect; `gh auth login` to re-auth. |
| `dev:desktop` hangs at "waiting for http://localhost:5173" | Vite couldn't bind 5173 — usually Docker. | Stop the conflicting process or change `server.port` in `vite.config.js` (and `dev:desktop`'s `wait-on` URL). `strictPort: true` is on purpose so a port collision fails loud. |
| Commit hook rejects "subject does not match the project convention" | Non-conventional subject. | See [CONTRIBUTING.md](./CONTRIBUTING.md). Format is `<type>(<scope>)?<!>?: <description>`, ≤72 chars, lowercase after the colon. |

## Testing & verification

`npm test -- --run` runs the Vitest suite (jsdom; the per-file baseline lives in VERIFICATION.md Stage 2). The canonical release checklist is [VERIFICATION.md](./VERIFICATION.md) — a six-stage V&V protocol covering static review, automated tests, the manual desktop walkthrough, adversarial checks, and the hard product constraints (renderer isolation, IPC allow-list, approval boundaries). Run it before any release or after any large refactor.

## Roadmap

The full vision and phased plan live in [ROADMAP.md](./ROADMAP.md). Phase 5 is complete and the v1 ship-gate items are addressed across PRs #36 / #37 / #38 / #40 / #41. Remaining v1.1 work and deferred items are listed there.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md). Short version: AI agents propose changes via PRs; CI gates the merge.

Work is tracked in the project-cycle files: defects in [bugs.md](./bugs.md), scoped features in [features.md](./features.md), shipped/fixed history in [CHANGELOG.md](./CHANGELOG.md). File a `BUG-NNN` / `FEAT-NNN` entry before fixing or building; migrate it to the changelog when it lands. The full lifecycle is described in [AGENTS.md](./AGENTS.md).
