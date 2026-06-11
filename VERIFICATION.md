# Citybase — End-to-End Verification & Validation Protocol

This document is the canonical checklist for taking Citybase from "compiles" to
"ship-ready". Run it before any release, after any large refactor, and any
time you suspect a regression. It is **executable from a cold start** — every
command is written verbatim, every expected output is named, and every
"manual" step has unambiguous accept / reject criteria.

Citybase is a two-tier Electron desktop app: a React 19 + Vite 8 renderer
(`src/`, ESM `.js`/`.jsx`) and an Electron 42 main/preload tier
(`electron/`, CommonJS `.cjs`). The renderer is sandboxed, runs only inside
Electron (the browser-only path was removed), and talks to the
main process only through the typed `window.citybase` preload bridge. Agent
work is dispatched to local `claude` / `codex` CLIs behind the provider-neutral
`AgentProvider` contract. There is no backend, no database, and no container;
persistent state is a single `workspaces.json` under Electron `userData`.

See also: [`bugs.md`](./bugs.md), [`features.md`](./features.md),
[`CHANGELOG.md`](./CHANGELOG.md), [`README.md`](./README.md).

## How to use this file

1. Work top-to-bottom. Do not skip stages.
2. Tick each step locally as you go.
3. Every failed step files a `BUG-NNN` entry in `bugs.md`.
4. Every gap that is a missing feature, not a defect, files a `FEAT-NNN` in `features.md`.
5. Fill in the summary table (§ 6.3) and either declare the build green or block on open `BUG-NNN`s.

Time estimate: automated stages (0–2 plus the scripted parts of 3–5) ~10
minutes; a full run including the manual desktop and agent walkthroughs
~45–75 minutes.

## Roles & abbreviations

- **Host** — the developer machine running the protocol (Windows 11 / macOS / Linux).
- **Renderer** — the React app served by Vite (dev) or loaded from `dist/index.html` (prod).
- **Main** — the Electron main process (`electron/main/main.cjs`).
- **Bridge** — the `window.citybase` API exposed by `electron/preload/preload.cjs`.
- **Dev flags** — `--dev` argv or `CITYBASE_DEV=1` env selects the dev server target;
  `CITYBASE_DEV_URL` overrides the default `http://localhost:5173` (see Appendix D).

Commands are given in bash (CI parity; Git Bash works on Windows). PowerShell
equivalents appear where the syntax differs materially.

---

## Stage 0 — Pre-flight

- [ ] 0.1 Node is 20+ and npm resolves:
  ```bash
  node --version   # expect v20.x or later
  npm --version
  ```
- [ ] 0.2 Git is ≥ 1.8.5 (the workspace service depends on `git -C <path>`):
  ```bash
  git --version
  ```
- [ ] 0.3 Dependencies installed from the lockfile:
  ```bash
  npm ci
  ```
  Expected: exits 0. The `postinstall` script sets `core.hooksPath`.
- [ ] 0.4 Commit hook is active:
  ```bash
  git config core.hooksPath   # expect: hooks
  ls hooks/commit-msg         # expect: file exists
  ```
- [ ] 0.5 Port 5173 is free (Vite uses `strictPort: true` and will not fall back):
  ```bash
  # bash/macOS/Linux:
  lsof -i :5173 || echo free
  ```
  ```powershell
  # PowerShell (no output = free):
  Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
  ```

## Stage 1 — Static / spec compliance review

- [ ] 1.1 Lint is zero-error, zero-warning:
  ```bash
  npm run lint
  ```
  Expected: exits 0 with no findings printed.
- [ ] 1.2 Runtime dependencies are frozen at exactly `react` + `react-dom`
  (AGENTS.md: no new runtime deps without PR justification):
  ```bash
  node -e "const d=Object.keys(require('./package.json').dependencies);console.log(d.join(','));process.exit(d.length===2&&d.includes('react')&&d.includes('react-dom')?0:1)"
  ```
  Expected: prints `react,react-dom`, exits 0.
- [ ] 1.3 No TypeScript migration crept in (deferred by project rule):
  ```bash
  git ls-files '*.ts' '*.tsx'
  ```
  Expected: no output.
- [ ] 1.4 No styling-system swap crept in:
  ```bash
  git grep -iE "tailwind|styled-components|@emotion|storybook" -- package.json
  ```
  Expected: no output.
- [ ] 1.5 Renderer security flags intact in `electron/main/main.cjs`:
  ```bash
  git grep -n "contextIsolation: true\|nodeIntegration: false\|sandbox: true" electron/main/main.cjs
  ```
  Expected: all three lines present (currently `main.cjs:26-28`).
- [ ] 1.6 Preload exposes only the typed bridge — a single
  `contextBridge.exposeInMainWorld('citybase', …)` and no raw `ipcRenderer`
  handed to the renderer:
  ```bash
  git grep -n "exposeInMainWorld" electron/preload/preload.cjs
  ```
  Expected: exactly one match, for `'citybase'`.
- [ ] 1.7 Process spawning is contained to the main-process service layer:
  ```bash
  git grep -ln "child_process" -- src electron
  ```
  Expected: exactly one file — `electron/main/services/processService.cjs`.
- [ ] 1.8 Fixture data stays out of production paths: `src/data/seed.js` is
  test-fixture data only (the re-export shims were deleted when the renderer
  went live-data):
  ```bash
  git grep -ln "data/seed" -- src ':!src/tests'
  ```
  Expected: no output — only files under `src/tests/` may import seed. Then
  review any diff to `src/game/*.jsx` / `src/views/*.jsx` since the last
  verified SHA for inline `const` data arrays (manual judgement).
- [ ] 1.9 Doc drift: README scripts table matches `package.json / scripts`,
  and AGENTS.md / ROADMAP.md claims still describe reality. Drift files a
  `BUG` (area `docs`) — do not silently fix.

A failure in this stage is a hard block.

## Stage 2 — Automated builds & tests

- [ ] 2.1 Production renderer build:
  ```bash
  npm run build
  ```
  Expected: exits 0; `dist/index.html` plus hashed `dist/assets/*.js` and
  `*.css` are produced; index.html references assets with the **relative**
  `./assets/` prefix (required for Electron `loadFile`):
  ```bash
  grep -E 'src="\./assets|href="\./assets' dist/index.html
  ```
  Expected: one `<script>` and one `<link>` line.
- [ ] 2.2 Full unit/component suite, single pass:
  ```bash
  npm test -- --run
  ```
  Expected: `Test Files  26 passed (26)`, `Tests  313 passed (313)`, exit 0.
- [ ] 2.3 Test-count baseline matches the collector:
  ```bash
  npx vitest list | wc -l   # expect: 313
  ```
  A mismatch with the table below means tests appeared or disappeared without
  a deliberate decision — investigate before ticking, then update the table
  in the same change as the run.

**Baseline (2026-06-11, SHA `1356437`): 26 test files / 313 test cases — all Vitest (jsdom).**

| Test file | Cases | | Test file | Cases |
|---|---|---|---|---|
| `activity.test.js` | 12 | | `detectAgentBinaries.test.js` | 10 |
| `AdventurerAnalysis.test.jsx` | 7 | | `ipcHandlers.test.js` | 26 |
| `agentAdapter.test.js` | 13 | | `menuTemplate.test.js` | 8 |
| `agentManager.test.js` | 28 | | `parseBranchList.test.js` | 8 |
| `App.idle.test.jsx` | 16 | | `parseFiles.test.js` | 12 |
| `App.smoke.test.jsx` | 2 | | `parseUnifiedDiff.test.js` | 10 |
| `AppAutoBoot.test.jsx` | 7 | | `resolveProvider.test.js` | 7 |
| `ApprovalModal.test.jsx` | 10 | | `runReview.test.js` | 23 |
| `BranchSelector.test.jsx` | 8 | | `useAgentDetect.test.jsx` | 5 |
| `citybaseApi.test.js` | 11 | | `windowConfig.test.js` | 10 |
| `CityMapDirty.test.jsx` | 6 | | `workspaceChecks.test.js` | 13 |
| `cityModel.test.js` | 11 | | `ClaudeAdapter.test.js` | 17 |
| `CliAgentAdapter.test.js` | 8 | | `CodexAdapter.test.js` | 25 |

- [ ] 2.4 Desktop E2E smoke (Playwright `_electron`, FEAT-001) — requires a
  fresh `dist/`:
  ```bash
  npm run build
  npm run test:e2e
  ```
  Expected: `1 passed` — window opens titled "Citybase", `window.citybase`
  bridge alive (`app.getVersion()` resolves over real IPC), renderer sandboxed
  (`require`/`process` undefined), agent detection answers with boolean shape.

A failure in this stage is a hard block.

## Stage 3 — Functional E2E walkthrough

- [ ] 3.1 Renderer smoke (scripted) is the desktop E2E in Stage 2.4 — there
  is no browser-only path to probe (the `dev`/`preview` scripts were removed;
  `citybaseApi` throws without the bridge). Tick when 2.4 passed in this run.
- [ ] 3.2 Desktop dev shell (manual — launches a GUI):
  ```bash
  npm run dev:desktop
  ```
  Accept: an Electron window titled "Citybase" opens (1480×960 default),
  detached DevTools open, the city view renders with no console errors.
  Reject: blank window, missing bridge errors, or any uncaught exception.
- [ ] 3.3 Built renderer in the desktop shell, no dev server (manual):
  ```bash
  npm run build && npm run start:desktop
  ```
  Accept: app loads `dist/index.html` from disk; the three views switch
  (city / kanban / analysis); DevTools do **not** auto-open.
- [ ] 3.4 Workspace flow (manual): via the app menu, Open Workspace → pick a
  real local Git repository.
  Accept: top bar shows the repo name, current branch, and dirty/clean state;
  city districts reflect the folder tree; branch selector lists real branches.
  Then quit and relaunch: the workspace is restored automatically (v1
  auto-boot gate) with no intermediate clicks.
- [ ] 3.5 Run-checks action (manual): trigger RUN CHECKS on the open
  workspace. Accept: one row per available npm script (`lint` / `test` /
  `typecheck` where defined) with pass/fail state and duration; the test row
  uses `--run` (no watch-mode hang).
- [ ] 3.6 Agent walkthrough (manual; requires at least the `claude` CLI
  installed — `codex` optional per the v1 gate):
  - Settings/detection shows each installed binary as found, missing ones
    with a clear prompt (not an error).
  - A read-only request streams status events into the UI and completes.
  - A write-capable request raises the approval modal **before** any file
    change; Approve proceeds, Reject cancels with no diff on disk.
  - Cancel mid-run terminates within a few seconds and the run shows
    `cancelled`, not `failed`.
  Flag: this step cannot be scripted from this protocol (interactive CLIs,
  user-present approvals). It is manual by design.

Failures here log a `BUG-NNN` and the run continues.

## Stage 4 — Adversarial / stress checks

- [ ] 4.1 Renderer isolation probe (manual, in the DevTools console of a
  running desktop window):
  ```js
  typeof window.require        // expect: 'undefined'
  typeof process               // expect: 'undefined'
  Object.keys(window.citybase) // expect: ['app','workspace','git','checks','agents','menu']
  ```
- [ ] 4.2 IPC abuse — unknown ids are rejected, not crashed (DevTools console):
  ```js
  await window.citybase.git.getSnapshot('bogus-id')  // expect: rejection "unknown workspace id"
  ```
  The main process must stay alive and the UI responsive afterwards.
- [ ] 4.3 Non-repo workspace: Open Workspace on a plain folder (no `.git`).
  Accept: the invalid-repo empty state renders; no crash; no zombie git
  processes.
- [ ] 4.4 Corrupt state file: with the app closed, overwrite `workspaces.json`
  (Appendix A) with `not json`, relaunch.
  Accept: app boots to the empty/no-workspace state (the `readState` catch
  path), logs a warning, and the next successful pick rewrites valid JSON.
- [ ] 4.5 Restart preserves data: open a workspace, quit, relaunch — the
  workspace list and current selection survive (state lives in
  `workspaces.json`, not memory).
- [ ] 4.6 Forget drops data: forget the current workspace — it leaves the
  recent list, `currentId` clears, and relaunch boots to first-run state.
- [ ] 4.7 Missing agent binary: with a provider not installed, attempt a run.
  Accept: a clear failure state (missing binary), not a hang or a stack trace
  in the UI.
- [ ] 4.8 Port conflict: occupy 5173, then `npm run dev`.
  Accept: Vite exits immediately with a strict-port error (no silent
  fallback to another port, which would strand `dev:desktop`'s `wait-on`).

Failures here log a `BUG-NNN` and the run continues.

## Stage 5 — Hard product-constraint verification

Re-tick the non-negotiable contracts as a deliberate gate (most were checked
mechanically in Stage 1; this stage is the human sign-off):

- [ ] 5.1 **Renderer never gets Node.** `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true` (Stage 1.5) **and** the live
  probe (4.1) both passed.
- [ ] 5.2 **IPC is allow-listed.** Every handled channel originates from
  `createIpcHandlers` (`electron/main/ipc.cjs`); the bridge exposes a fixed
  function surface; the renderer can never pass an arbitrary command string
  (1.6, 1.7 passed; `processService.cjs` is the only spawn site).
- [ ] 5.3 **`AgentProvider` abstraction intact.** Adapters live only under
  `electron/main/agents/` and implement the seven-method contract in
  [docs/agent-runtime.md](./docs/agent-runtime.md); the renderer talks to
  `src/app/citybaseApi.js`, never to a provider directly; provider selection
  flows through `resolveProvider`, not UI branching.
- [ ] 5.4 **Approval boundary holds.** Every file-changing agent mode requires
  explicit approval before execution (3.6 manual pass +
  `ApprovalModal.test.jsx` / `agentManager.test.js` green).
- [ ] 5.5 **Fully local, no telemetry.** No analytics or phone-home endpoints:
  ```bash
  git grep -nE "https?://" -- src electron | grep -vE "localhost|comment|//.*http"
  ```
  Expected (as of SHA `1356437`): exactly two hits — the user-initiated
  Help-menu `openExternal` link to the GitHub repo in
  `electron/main/menuTemplate.cjs` and its test. Any new hit must be
  user-initiated navigation, never an automatic network call.
- [ ] 5.6 **Scope constraints.** No TS files (1.3), no styling-system deps
  (1.4), runtime deps frozen (1.2) — re-confirmed at this gate.
- [ ] 5.7 **Single mock-data source.** `src/data/seed.js` is canonical and the
  two shims re-export it (1.8).

A failure in this stage is a hard block.

## Stage 6 — Reporting

- [ ] 6.1 Every failed step has a `BUG-NNN` in `bugs.md`.
- [ ] 6.2 Every gap has a `FEAT-NNN` in `features.md`.
- [ ] 6.3 Fill in the summary table:

```
| Stage                    | Pass / Fail | Notes |
|--------------------------|-------------|-------|
| 0 Pre-flight             |             |       |
| 1 Static review          |             |       |
| 2 Automated tests        |             |       |
| 3 Functional E2E         |             |       |
| 4 Adversarial            |             |       |
| 5 Hard constraints       |             |       |
| 6 Reporting hygiene      |             |       |
```

- [ ] 6.4 Record run metadata: `git rev-parse --short HEAD`, `node --version`,
  `npm --version`, host OS, and any dev flags in effect (`CITYBASE_DEV`,
  `CITYBASE_DEV_URL`).
- [ ] 6.5 If all green: append a `Verified` entry to
  `CHANGELOG.md / Unreleased / Verified` and migrate any
  `*-pending-migration` tickets per the lifecycle in AGENTS.md.

A build is **release-ready** only if all six stages tick. A failed step in
Stages 1, 2, or 5 is a hard block.

---

## Appendix A — Inspecting persistent state

The only persistent state is `workspaces.json` in Electron's `userData`
directory (the app name is `Citybase`):

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Citybase\workspaces.json` |
| macOS | `~/Library/Application Support/Citybase/workspaces.json` |
| Linux | `~/.config/Citybase/workspaces.json` |

```powershell
Get-Content "$env:APPDATA\Citybase\workspaces.json"
```
```bash
cat "$HOME/Library/Application Support/Citybase/workspaces.json"   # macOS
```

Shape: `{ "currentId": "<sha1-16>", "workspaces": [{ id, name, rootPath,
openedAt, lastOpenedAt }] }` — max 12 recents, most recent first.

## Appendix B — Reusable command recipes

Run a single test file:
```bash
npx vitest run src/tests/App.smoke.test.jsx
```

Re-count the test baseline:
```bash
npx vitest list | wc -l
```

Find and stop a stray Vite listener left behind by `dev:desktop` (Windows):
```powershell
$pids = Get-NetTCPConnection -LocalPort 5173 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique
$pids | ForEach-Object { Stop-Process -Id $_ -Force }
```

Desktop E2E smoke (scripted Stage 2.4):
```bash
npm run build && npm run test:e2e
```

## Appendix C — Common platform commands

CI status for the current branch / a PR (CLI is authenticated; on Windows the
binary is `/c/Program Files/GitHub CLI/gh.exe`):
```bash
gh run list --limit 5
gh pr checks <N>
```

Verify the commit hook fires:
```bash
git commit --allow-empty -m "bad subject"   # expect: rejected by hooks/commit-msg
git commit --allow-empty -m "chore: hook check" && git reset --soft HEAD~1
```

## Appendix D — Toggling launch and provider variants

| Variant | How |
|---|---|
| Dev renderer (Vite + HMR) | `npm run dev:desktop`, or `electron . --dev`, or `CITYBASE_DEV=1` |
| Dev server on another URL | `CITYBASE_DEV_URL=http://localhost:5174` (with a matching Vite port) |
| Prod renderer from disk | `npm run build && npm run start:desktop` (no flag → loads `dist/index.html`) |
| Agent provider | per-workspace selection in the app settings; `claude` is the v1 default, `codex` optional (`resolveProvider`) |

There is no browser-only variant: `citybaseApi` throws without the bridge
(the stub was removed because it masked real bridge failures).

## Appendix E — Smoke checklist (sub-15-minute version)

- [ ] `npm run lint` → exit 0
- [ ] `npm run build` → exit 0, relative `./assets/` in `dist/index.html`
- [ ] `npm test -- --run` → all green (baseline table in Stage 2)
- [ ] `npm run test:e2e` → desktop smoke passes against the fresh build
- [ ] `npm run dev:desktop` → window opens, city renders, no console errors
- [ ] DevTools: `typeof process === 'undefined'` and `window.citybase` defined
- [ ] Open Workspace on a real repo → branch + dirty state shown
- [ ] Relaunch → workspace auto-restored
