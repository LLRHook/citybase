# Citybase — Software Requirements Specification & Plan of Action

| | |
|---|---|
| Version | 0.1 (draft) |
| Date | 2026-06-11 |
| Baseline | `main` @ `1356437` ("docs: scope v1 to Claude-first + auto-boot gate") |
| Scope | As-built behavior of the current prototype + v1 target requirements from [ROADMAP.md](../ROADMAP.md), followed by a prioritized plan of action derived from a full-codebase review |

---

## 1. Introduction

### 1.1 Purpose

This document serves two functions. Sections 2–5 are a requirements specification: they record what Citybase actually does today (the as-built baseline, useful as a regression contract) and what v1 must do (the target, derived from the ROADMAP ship gate). Sections 6–7 are the review output: a register of every defect found during a full read of the codebase, and a sequenced plan of action to close them.

### 1.2 Scope

Citybase is a local-first Electron desktop application that renders one Git repository as an isometric hex-tile city and dispatches local CLI coding agents (`claude`, `codex`) against it. It is not a SaaS platform, not a coding agent itself, and does not display raw code as the primary experience. The review covered every source file in `electron/`, `src/`, the build/CI/tooling configuration, the commit hooks, and all 26 test files.

### 1.3 Definitions

Terms follow [docs/domain-model.md](./domain-model.md): a *district* is a top-level repo folder, a *building* is a file, a *quest* is a unit of work, an *adventurer* is a coding agent, a *run* is one agent invocation, and a *workspace* is the selected local Git repository.

### 1.4 References

[ROADMAP.md](../ROADMAP.md) (phases, adapter contract, v1 ship gate), [AGENTS.md](../AGENTS.md) (project rules), [docs/agent-runtime.md](./agent-runtime.md) (AgentProvider contract), [CONTRIBUTING.md](../CONTRIBUTING.md) (commit/PR conventions).

### 1.5 Verification basis

Three parallel deep-review passes (Electron main process + agent runtime; renderer; build/CI/tooling) read every line of production source. Every Critical/High finding cited below was then re-verified by direct inspection of the cited lines. Ground truth on checks (all verified during this review, see §6.4): `npm run lint` passes, `npm run build` passes, and the Vitest suite passes 313/313 tests across 26 files. The ROADMAP claims about CI (SHA-pinned actions, least-privilege token) were verified true against the GitHub API. Note the central paradox this review surfaces: every check is green while several shipped features are broken — the defects live precisely in the integration glue (preload↔main, IPC defaults, real process spawning) that no current test executes.

---

## 2. System Overview (As-Built)

### 2.1 Architecture

```text
React 19 renderer (src/)                 — views, hooks, pure projections; no Node access
        │  window.citybase (contextBridge)
preload (electron/preload/preload.cjs)   — typed API surface; 23 invoke channels + 2 push channels
        │  ipcMain.handle allow-list
main process (electron/main/)            — window lifecycle, menu, IPC registration
  services/                              — workspaceService (persistence), gitService (read-only git),
                                           processService (execFile gateway), workspaceChecks (npm scripts)
  agents/                                — AgentAdapter contract, CliAgentAdapter base,
                                           ClaudeAdapter / CodexAdapter, agentManager (runs + approvals),
                                           detect (PATH scan), parseUnifiedDiff, resolveProvider
```

Key qualities of the as-built design, confirmed during review: argv-array spawning only (no shell strings anywhere), `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`, raw `ipcRenderer` never exposed, a pure-function discipline in parsers and projections with dependency injection throughout, and a browser-stub fallback so the renderer runs as a plain web page.

### 2.2 Technology stack

React 19.2 + Vite 8 renderer (JavaScript, deliberately not TypeScript), Electron 41 shell, electron-builder 26 (mac `dir` target only, asar), Vitest 4 + React Testing Library + jsdom, ESLint 10 flat config. Runtime dependencies are exactly `react` and `react-dom`; everything else is dev. State lives in `App.jsx` per project rule; mock data is canonical in `src/data/seed.js`.

### 2.3 Roadmap position

Phases 0A–1 are complete. Phases 2–5 have all landed partial slices (workspace + git snapshot + city projection from real data; adapters + provider selection; no-code analysis layout; branch selector, dirty glyphs, run-checks). However, several load-bearing claims of Phases 2, 3, and 5 are not actually met in the as-built code — see §4 and the findings register.

---

## 3. Functional Requirements — As-Built Baseline (FR-A)

Each statement below describes current behavior verified during review. Annotations like `[M3]` reference findings in §6 where the as-built behavior deviates from documented intent.

### FR-A1 Application shell

The app opens a single 1480×960 BrowserWindow. Dev mode (`--dev` argv or `CITYBASE_DEV=1`) loads the Vite dev server URL and opens detached DevTools; otherwise it loads `dist/index.html` from disk (relative-base build, asar-consistent). The menu offers Open Workspace, Settings, Close Workspace, Quit, and a hard-coded GitHub help link — the only `shell.openExternal` surface. No `setWindowOpenHandler` or `will-navigate` guard is installed `[M9]`. The preload requires a `.cjs` file from `electron/main/`, which is expected to fail under `sandbox: true`, silently degrading the desktop app to the browser stub `[M2]`.

### FR-A2 Workspace management

The user picks a directory via native dialog; the service verifies it is a directory (not that it is a Git repo) and persists `{currentId, workspaces[≤12]}` to `userData/workspaces.json`, keyed by the first 16 hex chars of SHA-1 of the realpath. The most recent workspace is restored on launch. Writes are non-atomic and unserialized `[M14]`. Agent runs are not persisted at all — in-memory only, lost on restart.

### FR-A3 Git snapshot (read-only)

Per snapshot, four git commands run in parallel pinned to the workspace cwd: `rev-parse --show-toplevel`, `status --porcelain=v2 --branch`, `log -n 30`, `ls-files -z`. Detached HEAD yields `branch: null`; a non-repo folder yields an `{error: {kind: 'no-git'}}` envelope rather than a throw. Quoted paths (unicode/special characters, `core.quotePath=true` default) are not unquoted and corrupt both the status parser and the unified-diff parser `[M12]`. The renderer never displays the error envelope `[R1]`.

### FR-A4 City projection

`projectRepoTreeToCityModel` (pure) maps top-level folders to districts seated on three concentric hex rings (36 seats, busiest folders innermost, overflow dropped), root files to a synthetic `core` district, with ≤12 buildings per district ("tower" files first) and district health = % of non-dirty tracked files. The renderer draws each district as a tile cluster of radius up to 2, while seats are only 1 cell apart — adjacent district footprints overlap and buildings from different districts can land on identical tiles `[R2]`; the 12th building wraps onto the district's center/label tile `[R9]`. Staged files render green glyphs, unstaged amber (pulsing), both a combined mark.

### FR-A5 Views and chrome

A single `view` state switches city / kanban / analysis; selections survive switches. The branch selector lazily lists real branches but checkout is intentionally not performed — selection records a pending pill only; stale data survives workspace switches `[R10]`. The activity feed projects recent commits and working-tree changes; relative timestamps are computed once per snapshot and freeze until the next manual refresh `[R7]`. Guilds, sagas, objectives, alerts, and the repo overview are empty or unreachable; quests exist only in memory if posted via modal. Several visible controls are inert chrome (transport, ⚙, minimap zoom, most ACTION tiles) `[R16]`.

### FR-A6 Agent detection and provider selection

Detection is a pure PATH scan for `codex`/`claude` (with Windows extension probing). The two production IPC call sites invoke it with no arguments, and the injectable `fsExists` defaults to `() => false` — so the settings UI always reports both CLIs "not installed," and `provider: 'auto'` always throws `[M3]`. Only the adapter-internal resolution path passes a real `fsExists`. A detect *error* renders identically to "not installed" `[R17]`.

### FR-A7 Agent runs

`agent.startRun` validates shape only, accepts an arbitrary `repoUrl` as the spawn cwd `[M6]`, resolves the binary, and runs the whole CLI to completion inside the IPC call via buffered `execFile` with a 15-second default timeout and 4 MB output cap `[M4]` `[M7]`. The argv shapes do not match the real `claude`/`codex` CLIs (acknowledged phase gap) `[M18]`. `streamEvents` replays a synthesized 3–4 event trail with fabricated future timestamps claiming edits were applied regardless of what happened `[M8]`. `cancel` flips an in-memory flag; the child process is never killed. On Windows, `.cmd` shims and bare `npm` cannot be spawned by `execFile` without a shell at all (Node ≥20.12 EINVAL hardening), so agent runs and checks are structurally broken on the developer's own platform `[M5]`. Run state (including buffered output) accumulates in memory without eviction `[M13]`.

### FR-A8 Approval boundary

The machinery exists end to end — `agentManager.requestApproval` returning a promise resolved by `agent.approve`/`agent.reject` IPC, a renderer queue hook, a modal, and a `listPendingApprovals` re-sync — but **no production code ever calls `requestApproval` or emits a `needsApproval` payload**. Write-mode runs execute immediately with no approval `[M1]`. The renderer hook also removes a request from its queue even when the approve/reject IPC call fails, orphaning the main-process promise `[R3]`, and the modal's backdrop click silently rejects `[R8]`.

### FR-A9 Checks

`checks.run(workspaceId)` reads the workspace `package.json` and serially runs `npm run lint|test|typecheck --silent` (test forced to `--run`), mapping results to pass/fail rows. The 15-second process timeout applies to each check `[M4]`; spawn failures are mislabeled "exited 0" because the error envelope misclassifies non-numeric error codes `[M11]`; on Windows `npm` cannot be spawned at all `[M5]`.

### FR-A10 Renderer data lifecycle

`useWorkspace` implements an idle/loading/ready/error machine with stale-async-write protection via a load token. `refresh()` calls `git.refresh()` with no workspaceId — the call always throws in main and is swallowed; the handler is the same function as `getSnapshot`, so the comment about re-reading git state describes behavior that doesn't exist `[R4]`. `refresh`/hydrate/close lack try/catch around `getCurrent`/`forget`, so an IPC failure strands the hook in `loading` forever `[R5]`. No file-watcher or polling exists; refresh is manual.

---

## 4. Functional Requirements — v1 Target (FR-V) and Gap Status

Requirements transcribed from the ROADMAP v1 ship gate; status reflects the as-built review.

| ID | v1 Requirement (ship gate) | Status | Blocking findings |
|----|---------------------------|--------|-------------------|
| FR-V1 | Installed desktop app launches without a dev server | **At risk** | M2 (preload bridge likely dead under sandbox); T8 (fonts fetched from Google at runtime) |
| FR-V2 | Auto-boot: most recent workspace restored, agent detection runs, usable state with no clicks | **Partial** | M2, M3 (detection always "not found"); R1 (error states invisible) |
| FR-V3 | Open one local Git repository | **Met** (desktop path; no Git-ness validation at pick) | M14 (persistence robustness) |
| FR-V4 | City view generated from the real repository | **Partial** | R2/R9 (overlapping district layout on real repos) |
| FR-V5 | Git status, branch, recent changes are real | **Met** | M12 (quoted-path corruption), R7 (frozen timestamps) |
| FR-V6 | Claude adapter available when `claude` installed; default first-run provider; clear prompt when missing | **Not met** | M3, M5, M18, R17 |
| FR-V7 | Read-only request and write-capable *approved* request work end to end | **Not met** | M1 (approval never requested), M4 (15 s timeout), M7 (cancel impossible), M18 (argv wrong) |
| FR-V8 | Default review surface shows no raw code | **Met** (analysis layout is no-code-first) | M8 (trail content is fabricated) |
| FR-V9 | Handles missing Git, missing agents, auth failures, cancelled runs cleanly | **Not met** | R1, M3, M7, M11 |
| FR-V10 | Build, lint, typecheck, smoke tests green | **Partial** | T1 (electron/ unlinted), T4 (no desktop smoke test), no typecheck exists |
| FR-V11 | README covers setup, architecture, safety model, troubleshooting | **Partial** | Safety model section absent; troubleshooting absent |

---

## 5. Non-Functional Requirements

### NFR-1 Security

The renderer must never gain Node access or arbitrary shell execution (as-built: holds — argv arrays only, allow-listed channels, no raw ipcRenderer). All file-changing agent actions must pass an explicit approval boundary (as-built: **violated**, M1). IPC inputs must be validated against known workspace ids (as-built: violated for `agent.startRun`, M6). The window must deny child windows and external navigation (absent, M9), and the packaged renderer should carry a restrictive CSP and no runtime third-party fetches (absent, T8). The main process must be lint-covered like the rest of the codebase (absent, T1).

### NFR-2 Cross-platform

macOS is the first ship target, but the development happens on Windows: spawn semantics must work on both (`.cmd` shims, `npm.cmd`, process-tree kill) `[M5]` `[M15]`, and path/quoting handling must be locale- and unicode-safe `[M12]`.

### NFR-3 Reliability and resource bounds

Agent runs must not be artificially truncated (15 s / 4 MB defaults are sized for git commands, not agent sessions, M4); long-running children must be killable (M7/M15); run and approval state must survive renderer remounts (partially handled) and ideally app restarts (not handled); in-memory registries must be bounded (M13); persisted state writes must be atomic (M14).

### NFR-4 Maintainability and verification

CI runs lint → build → test on every PR (true today, SHA-pinned, least-privilege). Gaps to close: no Electron-level smoke test exercises the main/preload glue — exactly where the two highest-impact integration bugs (M2, M3) live undetected; no coverage tooling; Node 20 in CI is past EOL (T3); `npm test` defaults to watch mode; jsdom hosts Node-side service tests (T9).

---

## 6. Findings Register

Severity: **Critical** = defeats a core product/safety claim; **High** = breaks a shipped feature or ship-gate item; **Medium** = incorrect behavior with workaround or latent trigger; **Low** = hygiene, latent traps, dead code. "Verified" means re-confirmed by direct source inspection during synthesis, not just reported by a review pass.

### 6.1 Main process & agent runtime (M-series)

| ID | Sev | Location | Finding | Status |
|----|-----|----------|---------|--------|
| M1 | **Critical** | `agentManager.cjs:145`, `CliAgentAdapter.cjs:105`, `useApprovalRequests.js:27` | Approval pipeline has no producer: nothing calls `requestApproval` or emits `payload.needsApproval`; write-mode runs execute unapproved. The approve/reject channels resolve promises nobody awaits. | Verified (repo-wide grep: producers exist only in tests) |
| M2 | **High** | `preload.cjs:5` + `main.cjs:28` | `sandbox: true` preloads cannot `require` local CJS files (`../main/agents/constants.cjs`); the bridge likely throws at load and the renderer silently falls back to the browser stub — desktop features dead with no visible error. | Verified in source; needs one runtime confirmation (`window.citybase` in DevTools) |
| M3 | **High** | `detect.cjs:67`, `ipcHandlers.cjs:100`, `ipc.cjs:24` | `fsExists` defaults to `() => false` and both production call sites pass no args — settings detection always reports "not installed"; `provider:'auto'` always throws. Tests inject stubs so the glue bug is invisible to the suite. | Verified |
| M4 | **High** | `CliAgentAdapter.cjs:105`, `processService.cjs:12` | Agent runs and checks inherit the 15 s timeout / 4 MB buffer defaults; every real agent run is SIGTERM'd at 15 s, any test suite slower than 15 s "fails". | Verified |
| M5 | **High** (win32) | `detect.cjs:16`, `workspaceChecks.cjs:67` | `.cmd` shims (`claude.cmd`, `npm.cmd`) cannot be spawned via `execFile` without shell since Node 20.12 (EINVAL, CVE-2024-27980 hardening); there is no `npm.exe`. Agent runs and checks are broken on Windows. | Verified logic; platform behavior per Node release notes |
| M6 | **High** | `ipcHandlers.cjs:103`, `CliAgentAdapter.cjs:104` | `agent.startRun` spawns the CLI (and later `git diff` / `npm run`) in any renderer-supplied `repoUrl` directory — not validated against known workspaces, contradicting the IPC contract comment in `ipc.cjs:3-6`. | Verified |
| M7 | Medium | `CliAgentAdapter.cjs:94-131` | `startTask` blocks until CLI exit; the runId only exists after completion, so `cancel` is unreachable during a run. Violates the agent-runtime contract ("terminate within a few seconds"). | Verified |
| M8 | Medium | `CliAgentAdapter.cjs:33-51` | Synthesized event trail asserts false facts ("edits applied", "ready for review", `kind:'pr'`) with timestamps 1–3 minutes in the future, regardless of actual outcome. | Verified |
| M9 | Medium | `main.cjs` (absence) | No `setWindowOpenHandler` / `will-navigate` guard; dev mode loads an env-controlled URL with the full agent-spawning API attached. | Verified (absence) |
| M10 | Medium | `agentManager.cjs:96-101` | Manager-assigned runId is never passed back into the adapter; any adapter relying on the documented "manager assigns runId" path breaks all subsequent delegation. Latent (current adapter always self-assigns). | Reported, code-consistent |
| M11 | Medium | `processService.cjs:36-45` | Error envelope misreports: ENOENT and timeout both surface `code: 0`; the `'ETIMEDOUT'` branch is dead; any external SIGTERM is classified as timeout. Checks then render spawn failure as "exited 0". | Verified |
| M12 | Medium | `parseUnifiedDiff.cjs:33`, `gitService.cjs:120-170` | Git C-quoted paths (unicode) unhandled: the diff parser silently merges one file's hunks into the previous file; the status parser emits literal quoted strings that mismatch `ls-files`. | Reported with quoted evidence |
| M13 | Low-Med | `CliAgentAdapter.cjs:121` | `_runs` map (up to 8 MB buffered output per run) never pruned; manager cancel doesn't release adapter state. | Verified |
| M14 | Low-Med | `workspaceService.cjs:43-47` | `workspaces.json` read-modify-write races across concurrent IPC; non-atomic write; corrupt JSON silently resets all recents. | Reported |
| M15 | Low | `processService.cjs:30` | SIGTERM-only kill, no escalation, no process-tree kill (orphaned `npm` grandchildren); >4 MB diffs parsed silently truncated with no indicator. | Reported |
| M16 | Low | `agentManager.cjs:95-104` | runId collision check runs after the duplicate CLI already executed. Theoretical with UUIDs. | Reported |
| M17 | Low | `ipcHandlers.cjs:108`, `preload.cjs:17` | Events emitted before the renderer subscribes are dropped; no replay channel for ordinary events (approvals have `listPendingApprovals`). | Reported |
| M18 | Low (acknowledged) | `ClaudeAdapter.cjs:19`, `CodexAdapter.cjs:18` | argv shapes match neither real CLI (`claude` wants `--print --output-format stream-json`; `codex` wants the `exec` subcommand); every real run exits non-zero. Planned slice; recorded so the SRS doesn't claim these flags work. | Verified (in-code comment concurs) |
| M19 | Low (docs) | `ROADMAP.md:96` vs `docs/agent-runtime.md:34` | Two incompatible documented `AgentEvent` shapes; code implements a third convention for approvals (`payload.needsApproval`) documented nowhere. | Verified |

### 6.2 Renderer (R-series)

| ID | Sev | Location | Finding | Status |
|----|-----|----------|---------|--------|
| R1 | **High** | `App.jsx` (whole), `map.jsx:230` | Invalid-repo / missing-git / failed-pick errors are never rendered: App reads neither `workspace.status === 'error'`, `workspace.error`, nor `snapshot.error`. A non-repo folder shows a connected, empty city. Violates Phase 2 DoD and ship gate FR-V9. | Verified (grep: no error reads in App.jsx) |
| R2 | **High** | `cityModel.js:18-28` vs `map.jsx:9-15` | District seats are 1 hex apart but each district draws a tile cluster of radius ≤2: adjacent footprints overlap; core's tile `[1,0]` *is* the first ring seat. Invisible with seed data (centers 3–4 apart), guaranteed with real repos. | Verified |
| R3 | **High** | `useApprovalRequests.js:61-77` | `finally { removeFromQueue(runId) }` drops the approval from the UI even when the IPC call failed — main still holds the pending promise; nothing re-syncs after mount; the rejection also escapes uncaught through the modal callbacks. | Verified |
| R4 | Medium | `useWorkspace.js:66`, `preload.cjs:37`, `ipcHandlers.cjs:86` | `git.refresh()` is invoked with no workspaceId → always throws in main → swallowed. The channel is also the same handler as `getSnapshot`, so even a "fixed" call would double-compute. Dead call masquerading as freshness logic. | Verified |
| R5 | Medium | `useWorkspace.js:57-86` | `refresh`/hydrate/`close` have no try/catch around `getCurrent`/`forget`; an IPC failure strands `status: 'loading'` forever (REFRESH gives no feedback) and leaks an unhandled rejection. | Verified |
| R6 | Medium | `modals.jsx:30`, `App.jsx:496` | `QuestDetailModal` keeps stale `picked` adventurer when `selectedQuest` changes while mounted (no `key={quest.id}`); a previously picked, now-ineligible adventurer can be submitted. | Reported |
| R7 | Medium | `App.jsx:137`, `activity.js:26` | Relative commit times ("12m") are computed once per snapshot reference and freeze until manual refresh. | Verified |
| R8 | Medium | `modals.jsx:283` | Approval modal: backdrop click silently **rejects** (destructive dismissal); no dialog semantics/focus trap/Escape; approve-then-backdrop double-fires approve+reject (second throws uncaught in main, compounding R3). | Verified |
| R9 | Medium | `map.jsx:39` + `cityModel.js:149` | Off-by-one: 12 buildings × `tiles[(i + 1) % tiles.length]` wraps building 12 onto the center/label tile; small-tile districts stack buildings. | Verified |
| R10 | Medium | `branchSelector.jsx:35-54`, `App.jsx:341` | Branch list not refetched/reset on workspace switch; out-of-order responses overwrite newer data (no token); `selectedBranch` pending pill persists across workspace switches. | Reported |
| R11 | Low (latent) | `App.jsx:160-180` | 80 ms whole-tree re-render interval when any quest is active; currently unreachable (guilds always empty) but a Phase 6 trap — nothing is memoized, including the SVG city. | Reported |
| R12 | Low | `App.jsx:244` | Toast timers never cleared on unmount; no cap on queue length. | Reported |
| R13 | Low | `App.jsx:257-266` | Mock leftovers in live handlers: hardcoded `t: '24:18'` (invalid clock), hardcoded author, fake ETA; collision-prone id arithmetic. | Reported |
| R14 | Low | `modals.jsx:7,28,166` | Quest modals use seed `DISTRICTS` for the dropdown/lookup, so quests posted against a real workspace target districts that don't exist in the projected city. | Reported |
| R15 | Low | `command.jsx:458` | `SYSTEM_STATS` inline mock array inside a component file violates the AGENTS.md rule (currently dead code); seed's `OBJECTIVES`/`ALERTS` exports are unused. | Reported |
| R16 | Low | `App.jsx:356`, `command.jsx:426-543`, `analysis.jsx:229` | Dead/inert UI presented as live: ⚙, minimap zoom, transport, "Open run log", and ACTION tiles (deploy etc.) that toast "dispatched" without doing anything. | Reported |
| R17 | Low | `App.jsx:539-564` | Agent-detect *error* renders identically to "not installed" — misleading for the ship-gate "clear settings prompt". | Verified |
| R18 | Low (latent) | `command.jsx:443`, `theme.jsx:143` | `Sparkline` divides by `data.length - 1` (÷0 for 1 point; `-Infinity` for empty); `NeonBar` unguarded `value/max`. Safe with current static callers only. | Reported |
| R19 | Low | `map.jsx:226`, `analysis.jsx:347` | Index keys on reorderable lists (pawns, checks, comments). | Reported |
| R20 | Low | `activity.js:26-38` | Commits older than 24 h render bare wall-clock `HH:MM`, indistinguishable from today-times. | Reported |
| R21 | Low | `branchSelector.jsx:62-72` | Effect references `wrapperRef` declared below it — works today, TDZ trap on refactor. | Reported |
| R22 | Info | `citybaseApi.js` | Browser stub diverges deliberately (refresh→null, approve/reject silently succeed); method/arity parity with preload is otherwise exact. | Verified |

### 6.3 Build, CI, tooling, process (T-series)

| ID | Sev | Location | Finding | Status |
|----|-----|----------|---------|--------|
| T1 | **High** | `eslint.config.js:8,10` | Entire `electron/` tree is unlinted (`globalIgnores(['dist', 'electron'])` and no `.cjs` in the files glob) — the security-sensitive half of the app has zero lint coverage. | Verified |
| T2 | Medium | `.claude/hooks/validate-commit-msg.sh:26-32` | Greedy sed captures the **last** `-m` argument, so multi-paragraph commits (`-m subject -m body`) are validated against the body and wrongly blocked. | Reported with evidence |
| T3 | Medium | `ci.yml:21`, `package.json` | CI on Node 20 (EOL April 2026); no `engines` field pins local Node; CI/local drift unbounded. | Verified |
| T4 | Medium | `ci.yml` (whole) | No Electron packaging step or desktop smoke test in CI — a broken main entry, preload path, or `files` glob ships green. Phase 1 work item explicitly called for one; this is exactly where M2/M3 hid. | Verified (absence) |
| T5 | Low | `hooks/commit-msg:29-36` | Hook rejects git-generated messages: `Merge branch …`, default `Revert "…"` (capital R), `fixup!` subjects. | Reported |
| T6 | Low | `package.json:41`, build.files | `react`/`react-dom` as prod deps get auto-packed into the asar although Vite already bundles them — dead weight double-ship. | Reported |
| T7 | Low | `ROADMAP.md:114` | Stale claim: "pull_request trigger only" — workflow also triggers on push to main (config fine, claim wrong). SHA-pin and least-privilege claims verified true. | Verified |
| T8 | Low (security-adjacent) | `index.html:8-13`, `main.cjs` | Google Fonts fetched at runtime (silent degradation offline; violates "no web server required"); no CSP anywhere. | Verified |
| T9 | Low | `vite.config.js:13` | All tests — including Node-side Electron service tests — run under jsdom; environment mismatch can mask Node-only bugs. | Verified |
| T10 | Low | `.claude/settings.json:25` | PreToolUse hook uses cwd-relative path; silently fail-open if executed from another cwd. Use `$CLAUDE_PROJECT_DIR`. | Reported |
| T11 | Info | `hooks/commit-msg:36` | Regex stricter than CONTRIBUTING documents (rejects digit-leading and 1-char descriptions). | Reported |
| T12 | Info | `eslint.config.js:8` | `dist-electron/` missing from eslint ignores; `eslint .` crawls packaging output after a local `package:dir`. | Reported |

### 6.4 Ground-truth check results

Verified in a clean Linux environment against `main` @ `1356437`: `npm run lint` **pass** (exit 0); `npm run build` **pass** (renderer bundle 292 kB, built in <1 s); `vitest run` **pass — 26 files, 313/313 tests**. No finding in this document is contradicted by a check: every Critical/High defect lives in code paths the suite stubs out (injected `fsExists`, mocked `processService`, hand-written bridge mocks) or never executes (preload under real Electron). This is the strongest argument for WS3.1 (the Electron smoke test) landing first.

### 6.5 Test coverage gaps (most valuable first)

`useWorkspace` has zero tests despite being the most intricate async code in the renderer (would have caught R4, R5). No Electron-level smoke test executes `main.cjs`/`preload.cjs` under real Electron (would have caught M2, M3 permanently). `processService.run` has no direct tests (timeout, ENOENT, maxBuffer paths — M11). The renderer↔preload contract is tested against a hand-written mock, not the real preload surface, so drift is invisible. No App-level test renders an error-state workspace (R1), exercises approve/reject failure (R3), or covers the dispatch happy path. `workspaceService` is entirely untested (M14). Quoted-path fixtures are absent from parser tests (M12). No coverage tooling exists.

---

## 7. Plan of Action

Sequenced into four workstreams. Each item lists effort (S < ~half day, M ≈ 1–2 days, L ≈ 3+ days), the findings it closes, and acceptance criteria. Slice PRs per repo convention: small conventional-commit slices, squash-merged, CI green.

### WS0 — Ship-gate blockers (do first, in this order)

**WS0.1 — Restore the preload bridge under sandbox** (S; closes M2)
Inline the channel constant in `preload.cjs` (no local requires) and add a unit test asserting it equals the `constants.cjs` export. Acceptance: `window.citybase` is defined in a packaged launch; the Electron smoke test (WS3.1) asserts `app.getVersion()` resolves.

**WS0.2 — Fix production agent detection** (S; closes M3, R17)
Default `fsExists` to a real `fs.existsSync` wrapper in `detect.cjs`; add a glue-level test that calls `detectAgentBinaries()` with zero args. Render the detect-error state distinctly in the tweaks panel. Acceptance: with `claude` on PATH, settings shows "installed" without injected stubs.

**WS0.3 — Streaming process runner** (L; unlocks M4, M7, M8, M15, and real Phase 3/4 behavior)
Replace buffered `execFile` with a `spawn`-based API returning a handle (`{pid, onStdout, kill, done}`) with line-buffered NDJSON parsing, configurable/disabled timeout for agent runs, SIGTERM→SIGKILL escalation, and process-group kill for `npm`. Register the run *before* spawning so `cancel(runId)` is reachable mid-run. Derive events from real output; delete the fabricated trail. This single change retires four documented gaps in `CliAgentAdapter`'s header. Acceptance: a long-running fake CLI can be cancelled within seconds; events reflect actual exit state; checks tolerate slow test suites.

**WS0.4 — Wire the approval boundary** (M; closes M1, R3, R8; depends on WS0.3 for clean sequencing but can land against the blocking runner)
For write-mode skills, emit `payload: {needsApproval, summary}` and `await requestApproval(runId, summary)` before spawning the file-changing CLI. Renderer: only dequeue on IPC success, re-hydrate from `listPendingApprovals` on failure, disable modal buttons after first action, make backdrop a no-op. Document the `needsApproval` payload in `agent-runtime.md` (also closes M19 with T7's doc pass). Acceptance: a test asserts an edit-skill run does not invoke the CLI until `approveRun` fires; reject path never spawns.

**WS0.5 — Validate startRun against known workspaces** (S; closes M6)
Accept `workspaceId`, resolve via `workspaceService.getWorkspaceById`, reject unknown ids — symmetrical with the git handlers. Acceptance: handler test rejects an arbitrary path.

**WS0.6 — Windows spawn strategy** (M; closes M5)
Resolve `.cmd` shims to their underlying `node …/cli.js` invocation (preferred over `shell: true`, which would force shell-escaping of prompt text); use `npm.cmd`/`npm` per platform via the same mechanism. Acceptance: detection→run→checks pass on a Windows machine with npm-installed CLIs.

**WS0.7 — Surface error states in the renderer** (M; closes R1, R5, R4)
Add a `WorkspaceStatusBanner` driven by `workspace.status === 'error'` and `snapshot.error` (message + retry/pick affordance); exclude errored snapshots from the "linked" pill; wrap `refresh`/hydrate/`close` bodies in try/catch routing to the error state; delete the dead `git.refresh()` call and channel (or make it take the id and use its return value — one IPC round trip instead of three). Acceptance: AppAutoBoot-style tests cover non-repo folder, missing git, and failed refresh.

### WS1 — Correctness (next)

**WS1.1 — City layout geometry** (M; closes R2, R9): share one footprint constant between projector and renderer; scale ring seats to the cluster radius (or shrink clusters); cap buildings at `tiles.length - 1`. Add a layout test asserting no two districts share a tile and no building lands on a center tile.
**WS1.2 — Git quoted paths** (S–M; closes M12): run git with `-c core.quotePath=false` (and `-z` where applicable) or implement C-unquoting; add unicode fixtures to both parser suites; add a rename-only-diff fixture.
**WS1.3 — processService error taxonomy** (S–M; closes M11, M15-part): add `kind: 'not-found'|'timeout'|'non-zero'|'killed'|'output-truncated'` to the envelope; propagate `err.code` verbatim; derive `timedOut` from the configured timer; surface truncation. Update `workspaceChecks.metaFor` and gitService's "git not available" guess to use it. Direct tests for `processService.run`.
**WS1.4 — Branch selector lifecycle** (S; closes R10): reset list/status on `workspaceId` change, guard with a request token, clear `selectedBranch` on workspace switch.
**WS1.5 — Modal and feed hygiene** (S; closes R6, R7, R13, R14): `key={selectedQuest.id}`; coarse clock tick for relative times; real timestamps in activity handlers; pass live districts into quest modals.
**WS1.6 — Workspace persistence robustness** (S; closes M14): serialize mutations through a promise queue; temp-file + rename writes.
**WS1.7 — Run-registry bounds & manager/adapter consistency** (S; closes M13, M10, M16): evict completed runs (LRU/TTL); cancel releases adapter state; require adapters to return a runId or pass the manager's id into `startTask`.

### WS2 — Hardening & hygiene

**WS2.1 — Lint the main process** (S; closes T1, T12): remove `'electron'` from ignores, add a `.cjs`/commonjs/node-globals block, add `dist-electron` to ignores; fix whatever it flags.
**WS2.2 — Navigation guards + CSP + local fonts** (S–M; closes M9, T8): `setWindowOpenHandler(() => ({action:'deny'}))`, `will-navigate` restricted to dev origin/`file:`; self-host the two font families; restrictive CSP meta.
**WS2.3 — Toolchain currency** (S; closes T3, T6): CI to Node 22, `engines` field, README note; move react/react-dom to devDependencies (or exclude node_modules from the asar).
**WS2.4 — Hook fixes** (S; closes T2, T5, T10): anchor sed to the first `-m`; early-exit for `Merge`/`Revert "`/`fixup!`; `$CLAUDE_PROJECT_DIR` in settings hook.
**WS2.5 — Docs reconciliation** (S; closes M19, T7, R15, R16): single AgentEvent shape in agent-runtime.md (mark ROADMAP's superseded); fix the CI-trigger sentence; move/delete `SYSTEM_STATS`; remove or visibly disable inert controls; wire or delete seed `OBJECTIVES`/`ALERTS`.
**WS2.6 — Run persistence** (M; ROADMAP Phase 3 item): persist runs (timestamps, provider, prompt, final result) beside `workspaces.json`; doubles as the M13 eviction store.

### WS3 — Test & CI infrastructure

**WS3.1 — Electron smoke test in CI** (M; closes T4, permanently guards M2/M3-class bugs): Playwright `_electron` launch under xvfb asserting the window opens and `window.citybase.app.getVersion()` resolves; plus a `npx electron-builder --dir` packaging step.
**WS3.2 — useWorkspace test suite** (S–M): inject the api (same pattern as `useApprovalRequests`); cover token races, error paths, menu wiring.
**WS3.3 — Bridge contract test** (S): one shared manifest of `namespace.method` names asserted against both the preload surface and the browser stub.
**WS3.4 — Vitest environment split + coverage** (S; closes T9): node env by default, jsdom per-glob for component tests; add `@vitest/coverage-v8` and a `test:coverage` script; make `npm test` non-interactive (`vitest run`) with a `test:watch` alias.
**WS3.5 — CI ergonomics** (S): concurrency cancellation; macOS leg once WS3.1 lands; decide the OS matrix per the ROADMAP open question.

### Suggested PR sequence

1. WS0.1 + WS0.2 + WS3.1 in one slice ("make the desktop shell real and provable") — smallest diff, highest information value; the smoke test proves the first two.
2. WS0.3 (runner) → WS0.4 (approvals) → WS0.5/WS0.6 — the agent-harness arc; each independently green.
3. WS0.7 + WS1.4 + WS1.5 — renderer error/lifecycle arc.
4. WS1.1 + WS1.2 + WS1.3 — projection/parsing correctness arc.
5. WS2.x and WS3.x slices opportunistically behind the above.

---

## 8. Risks and Open Questions

The largest risk is compound invisibility: M2 (dead bridge) masks M3 (dead detection), which masks M18 (wrong argv), which masks M4 (fatal timeout) — each fix will reveal the next, so the WS0 ordering above is deliberate and the smoke test (WS3.1) should land first, not last. Second, the approval boundary (M1) is a product-trust claim made in three documents; until WS0.4 lands, any demo of a write-capable run contradicts the stated safety model — treat it as a hard gate for showing v1 to anyone. Third, real-CLI argv integration (M18) needs a decision on `claude --print --output-format stream-json` vs the Agent SDK, and `codex exec` — recommend resolving against current CLI docs when WS0.3 lands, since the streaming runner's event normalization depends on the chosen output format. Open questions inherited from the ROADMAP remain (macOS-only first build vs +Windows — note WS0.6 makes Windows viable; hidden code-editor panel) plus one new one: should run history persist per-workspace (`runs.json` keyed by workspace id) or globally? WS2.6 assumes per-workspace.
