# Citybase — Bug Tracker

This file is the working list of known issues. New bugs are appended here as they
are found. When a bug is fixed, tick its checkbox and move the entry (with the fix
note) to `CHANGELOG.md` so this file stays focused on outstanding work.

## Conventions

Each entry uses the form:

```
### [<id>] <short title>
- [ ] **Severity:** crit | high | med | low
- **Area:** renderer | electron | ipc | agents | git | tests | docs | build
- **File(s):** comma-separated paths (or "n/a")
- **Observation:** what was seen, with line refs where useful.
- **Expected:** what should happen, citing the spec section if relevant.
- **Repro / Notes:** how to confirm, or why it matters.
- **Status:** open | in-progress | fixed-pending-migration
```

Tick `- [x]` once verified fixed. The fixer also adds a `**Fix:**` line summarising
the change before migrating the entry to `CHANGELOG.md`.

Severity guide:
- **crit** — blocks build, run, or a hard product constraint (renderer isolation,
  IPC allow-list, approval boundary).
- **high** — data loss (e.g. `workspaces.json` corruption), crash, or a defining
  v1 feature is wrong.
- **med** — a documented v1 feature is missing or noticeably broken.
- **low** — UX polish, minor spec drift, or test-quality issue.

Area tags for this project:
- `renderer` — React/Vite UI (`src/`)
- `electron` — main process, window lifecycle, menu (`electron/main/`)
- `ipc` — preload bridge + IPC handlers (`electron/preload/`, `ipcHandlers.cjs`)
- `agents` — adapters, manager, detection (`electron/main/agents/`)
- `git` — git/workspace services (`electron/main/services/`)
- `tests` — Vitest suite quality or coverage (`src/tests/`)
- `docs` — README, ROADMAP, docs/, drifted documentation
- `build` — Vite build, electron-builder packaging, CI workflow

---

## Open

_Filed 2026-06-11 from [docs/srs-and-plan-of-action.md](./docs/srs-and-plan-of-action.md)
(SRS v0.1, baseline `main` @ `1356437`). Finding ids (M/R/T-series) and workstream
ids (WS) reference that document._

### Re-groom 2026-06-18 — disposition (verified against `main` @ `31c4014`)

A 15-agent adversarial re-verification of this backlog against current `main`
(post v1-wave / v2.0 / v3.0 / BUG-025..029). Every "resolved/obsolete" verdict was
independently challenged before acting — the challenge **overturned BUG-003** from
resolved to partial (CodexAdapter still synthesizes a fabricated event trail). Most
tickets predate the rebuilds; several premises reference files that no longer exist.

| Ticket | Disposition | Residual to implement |
|--------|-------------|------------------------|
| BUG-003 | partial (was high → med) | CodexAdapter inherits the base synthesized trail — emits "edits applied" at fabricated +60s timestamps on non-pass runs; make Codex derive events from real output (ClaudeAdapter already does) |
| BUG-005 | **current** (high) | `agent.startRun` spawns in a renderer-supplied `repoUrl`, unvalidated; resolve a `workspaceId`→rootPath and reject unknown ids (mirror the git handlers) |
| BUG-006 | partial (was high → med) | `.cmd` shim wrap shipped; bare `npm`/`gh` in `workspaceChecks.cjs:67` still fail on Windows (no `.exe`); resolve the launcher to `.cmd` on win32 |
| BUG-007 | partial (high) | workspace/snapshot error-state rendering still unimplemented; `refresh()`'s un-try/caught `getCurrent()` can strand `loading`. (dead `git.refresh()` strand: fixed; update stale `src/game/map.jsx` file ref) |
| BUG-008 | **resolved → migrated** | — old `src/game/map.jsx` deleted; v2.0 FEAT-014 seats districts at spacing 6.2 > 4.7 footprint (no overlap) and uses a Cartesian grid (no center-tile wrap); guarded by `iso.test.js` |
| BUG-009 | **current** (med) | no `-c core.quotePath=false` on git status/diff/log; add it (or C-unquote) + unicode/rename parser fixtures |
| BUG-010 | partial (was med → low) | ENOENT/timeout→`0` misclassification fixed; residual = no `kind` taxonomy on buffered `run()` envelope + dead `ETIMEDOUT` branch |
| BUG-011 | **current** (med) | `src/game/branchSelector.jsx` still wired via TopBar; add a request-token guard, reset list on workspace switch, clear `selectedBranch` on switch |
| BUG-012 | **obsolete → closed** | — quest/adventurer surface (`src/app/activity.js`, QuestDetailModal, seed `DISTRICTS`) all deleted in the v2.0 rebuild |
| BUG-013 | **current** (med) | `workspaceService.writeState` still non-atomic/racy/untested — apply the runStore serialize + temp-rename pattern just shipped for BUG-026, + first unit tests |
| BUG-014 | partial (med) | runId delegation + real child kill shipped; residual = adapter `_runs` Map never pruned (leak); add a release hook on cancel/evict (collision-after-spawn is low) |
| BUG-015 | **current** (high) | `electron/` in `globalIgnores` + `.cjs` absent from the files glob → main tier unlinted; lint it + add `dist-electron` to ignores |
| BUG-016 | partial (med) | subject-newline truncation added; residual = greedy sed still grabs the LAST `-m` (validates the body — reproduced); add Merge/Revert/fixup! allowlist; anchor the hook path to `$CLAUDE_PROJECT_DIR` |
| BUG-017 | partial → docs-only (low) | `command.jsx`/`seed.js` deleted (inert-controls/SYSTEM_STATS obsolete); residual = reconcile the two documented AgentEvent shapes + fix the stale "pull_request trigger only" CI claim in ROADMAP |
| BUG-018 | partial (low) | R11/R18/R19 obsolete (deleted files); residual = R12 toast-timer leak, R20 bare `HH:MM`, R21 `wrapperRef` TDZ ordering, M17 live-overlay `getEvents` backstop |
| BUG-019 | partial (med) | V&V (baseline 380→393) + this re-groom satisfy the core ask; residual = AGENTS.md "npm run dev" + README `src/game/data.js` doc drift |

Implementation-ready now (clearly current, unblocked): **BUG-015** (quick win — lints the tier just changed), **BUG-005** (security), **BUG-013** (reuses the BUG-026 pattern), **BUG-007** (ship-gate FR-V9), **BUG-009**.

### [BUG-003] Agent runs block until exit, fabricate events, cancel unreachable, killed at 15 s
- [ ] **Severity:** high
- **Area:** agents
- **File(s):** electron/main/agents/CliAgentAdapter.cjs, electron/main/agents/ClaudeAdapter.cjs, electron/main/agents/CodexAdapter.cjs
- **Observation:** `CliAgentAdapter.cjs:94-131` runs the whole CLI to completion inside
  the IPC call via buffered `execFile` with the 15 s / 4 MB defaults — every real agent
  run is SIGTERM'd at 15 s (SRS M4); the runId exists only after completion so
  `cancel` is unreachable mid-run (M7); `streamEvents` replays a synthesized 3–4 event
  trail with fabricated future timestamps claiming edits were applied regardless of
  outcome (M8, `CliAgentAdapter.cjs:33-51`).
- **Expected:** agent-runtime contract: cancellable within seconds, events derived from
  real output, no artificial truncation (docs/agent-runtime.md; NFR-3).
- **Repro / Notes:** depends on FEAT-004 (streaming runner). Register the run *before*
  spawning; configurable/disabled timeout for agent runs; delete the fabricated trail.
  Acceptance per WS0.3: a long-running fake CLI cancels within seconds; events reflect
  the actual exit state; checks tolerate slow test suites.
- **Status:** open

### [BUG-005] `agent.startRun` spawns in arbitrary renderer-supplied cwd
- [ ] **Severity:** high
- **Area:** ipc, agents
- **File(s):** electron/main/ipcHandlers.cjs, electron/main/agents/CliAgentAdapter.cjs
- **Observation:** `ipcHandlers.cjs:103` accepts an arbitrary `repoUrl` as the spawn
  cwd for the CLI (and later `git diff` / `npm run`) — not validated against known
  workspaces, contradicting the IPC contract comment in `ipc.cjs:3-6` (SRS M6).
- **Expected:** IPC inputs validated against known workspace ids, symmetric with the
  git handlers (NFR-1).
- **Repro / Notes:** WS0.5 — accept `workspaceId`, resolve via
  `workspaceService.getWorkspaceById`, reject unknown ids. Handler test rejects an
  arbitrary path.
- **Status:** open

### [BUG-006] Windows spawn broken: `.cmd` shims and `npm` cannot spawn via `execFile`
- [ ] **Severity:** high
- **Area:** electron, agents
- **File(s):** electron/main/agents/detect.cjs, electron/main/services/workspaceChecks.cjs, electron/main/services/processService.cjs
- **Observation:** `.cmd` shims (`claude.cmd`, `npm.cmd`) cannot be spawned via
  `execFile` without a shell since Node 20.12 (EINVAL, CVE-2024-27980 hardening), and
  there is no `npm.exe` — agent runs and checks are structurally broken on Windows,
  the development platform (SRS M5; `detect.cjs:16`, `workspaceChecks.cjs:67`).
- **Expected:** spawn semantics work on macOS and Windows (NFR-2).
- **Repro / Notes:** on Windows, `checks.run` → spawn failure (mislabeled "exited 0"
  per BUG-010). Fix per WS0.6: resolve `.cmd` shims to their underlying
  `node …/cli.js` invocation (preferred over `shell: true`, which would force
  shell-escaping of prompt text); `npm.cmd`/`npm` per platform via the same mechanism.
  Acceptance: detection → run → checks pass on Windows with npm-installed CLIs. Soft
  dependency on FEAT-004.
- **Status:** open

### [BUG-007] Workspace/git error states never rendered; dead `git.refresh()`; hook strands in `loading`
- [ ] **Severity:** high
- **Area:** renderer
- **File(s):** src/App.jsx, src/app/useWorkspace.js, src/game/map.jsx, electron/main/ipcHandlers.cjs, electron/preload/preload.cjs
- **Observation:** App reads neither `workspace.status === 'error'`, `workspace.error`,
  nor `snapshot.error` — a non-repo folder shows a connected, empty city (SRS R1).
  `useWorkspace.refresh()` calls `git.refresh()` with no workspaceId → always throws in
  main, swallowed; the channel shares the `getSnapshot` handler, so the freshness logic
  is dead code (R4, `useWorkspace.js:66`). `refresh`/hydrate/`close` have no try/catch
  around `getCurrent`/`forget` — an IPC failure strands `status: 'loading'` forever
  (R5).
- **Expected:** Phase 2 DoD: empty states for no workspace, invalid repo, and missing
  Git; ship gate FR-V9.
- **Repro / Notes:** WS0.7 — add a `WorkspaceStatusBanner` driven by error states with
  retry/pick affordances; exclude errored snapshots from the "linked" pill; wrap the
  hook bodies in try/catch routing to the error state; delete the dead `git.refresh()`
  call and channel (or make it take the id and use its return value). Tests: non-repo
  folder, missing git, failed refresh.
- **Status:** open

### [BUG-009] Git C-quoted (unicode) paths corrupt the status and diff parsers
- [ ] **Severity:** med
- **Area:** git
- **File(s):** electron/main/services/gitService.cjs, electron/main/agents/parseUnifiedDiff.cjs, src/tests/parseFiles.test.js, src/tests/parseUnifiedDiff.test.js
- **Observation:** with git's default `core.quotePath=true`, quoted paths are not
  unquoted: the diff parser silently merges one file's hunks into the previous file
  (`parseUnifiedDiff.cjs:33`) and the status parser emits literal quoted strings that
  mismatch `ls-files` (`gitService.cjs:120-170`) (SRS M12).
- **Expected:** locale- and unicode-safe path handling (NFR-2; FR-V5).
- **Repro / Notes:** repo with accented or space-containing filenames. WS1.2 — run git
  with `-c core.quotePath=false` (and `-z` where applicable) or implement C-unquoting;
  add unicode fixtures to both parser suites; add a rename-only-diff fixture.
- **Status:** open

### [BUG-010] `processService` error envelope misclassifies failures as "exited 0"
- [ ] **Severity:** med
- **Area:** electron
- **File(s):** electron/main/services/processService.cjs, electron/main/services/workspaceChecks.cjs, electron/main/services/gitService.cjs
- **Observation:** ENOENT and timeout both surface `code: 0`; the `'ETIMEDOUT'` branch
  is dead; any external SIGTERM is classified as timeout (SRS M11,
  `processService.cjs:36-45`) — checks render spawn failure as "exited 0". Kill is
  SIGTERM-only with no escalation or process-tree kill; >4 MB output is silently
  truncated (M15).
- **Expected:** failures classified accurately; checks display spawn failures as
  failures.
- **Repro / Notes:** WS1.3 — add `kind: 'not-found'|'timeout'|'non-zero'|'killed'|'output-truncated'`
  to the envelope; propagate `err.code` verbatim; derive `timedOut` from the configured
  timer; surface truncation; update `workspaceChecks.metaFor` and gitService's "git not
  available" guess. Direct tests for `processService.run` (none exist today, SRS §6.5).
- **Status:** open

### [BUG-011] Branch selector: stale list across workspace switches, no request token
- [ ] **Severity:** med
- **Area:** renderer
- **File(s):** src/game/branchSelector.jsx, src/App.jsx
- **Observation:** the branch list is not refetched/reset on workspace switch;
  out-of-order responses overwrite newer data (no token); the `selectedBranch` pending
  pill persists across workspace switches (SRS R10, `branchSelector.jsx:35-54`,
  `App.jsx:341`).
- **Expected:** branch list and pending selection scoped to the current workspace.
- **Repro / Notes:** switch between two workspaces, open the selector. WS1.4 — reset
  list/status on `workspaceId` change, guard with a request token, clear
  `selectedBranch` on switch.
- **Status:** open

### [BUG-013] `workspaces.json` writes are racy and non-atomic
- [ ] **Severity:** med
- **Area:** git
- **File(s):** electron/main/services/workspaceService.cjs
- **Observation:** read-modify-write races across concurrent IPC calls; the write is
  non-atomic; corrupt JSON silently resets all recents (SRS M14,
  `workspaceService.cjs:43-47`). The service is entirely untested (§6.5).
- **Expected:** persisted state writes are atomic and serialized (NFR-3).
- **Repro / Notes:** WS1.6 — serialize mutations through a promise queue; temp-file +
  rename writes; first unit tests for the service (injected fs).
- **Status:** open

### [BUG-014] Run registry unbounded; manager-assigned runId never reaches the adapter
- [ ] **Severity:** med
- **Area:** agents
- **File(s):** electron/main/agents/agentManager.cjs, electron/main/agents/CliAgentAdapter.cjs
- **Observation:** the adapter `_runs` map (up to 8 MB buffered output per run) is
  never pruned and manager cancel doesn't release adapter state (SRS M13,
  `CliAgentAdapter.cjs:121`); the manager-assigned runId is never passed back into the
  adapter — latent delegation break (M10, `agentManager.cjs:96-101`); the runId
  collision check runs after the duplicate CLI already executed (M16).
- **Expected:** bounded in-memory registries (NFR-3); manager/adapter id consistency.
- **Repro / Notes:** WS1.7 — evict completed runs (LRU/TTL); cancel releases adapter
  state; require adapters to return a runId or pass the manager's id into `startTask`.
  FEAT-008 (run persistence) can double as the eviction store.
- **Status:** open

### [BUG-015] Entire `electron/` tree is unlinted
- [ ] **Severity:** high
- **Area:** build
- **File(s):** eslint.config.js
- **Observation:** `globalIgnores(['dist', 'electron'])` plus no `.cjs` in the files
  glob (`eslint.config.js:8,10`) — the security-sensitive half of the app has zero
  lint coverage (SRS T1). `dist-electron/` is missing from ignores, so `eslint .`
  crawls packaging output after a local `package:dir` (T12).
- **Expected:** "ESLint over the project; zero errors and zero warnings" covers both
  tiers (README/CLAUDE.md; ship gate FR-V10; NFR-1).
- **Repro / Notes:** WS2.1 — remove `'electron'` from ignores, add a
  `.cjs`/commonjs/node-globals config block, add `dist-electron` to ignores; fix
  whatever it flags. Small and high-value — good early opportunistic slice.
- **Status:** open

### [BUG-016] Commit-hook defects: body validated instead of subject, git-generated messages rejected, fail-open hook path
- [ ] **Severity:** med
- **Area:** build
- **File(s):** .claude/hooks/validate-commit-msg.sh, hooks/commit-msg, .claude/settings.json
- **Observation:** the Claude PreToolUse hook's greedy sed captures the **last** `-m`
  argument, so multi-paragraph commits (`-m subject -m body`) are validated against
  the body and wrongly blocked (SRS T2, `validate-commit-msg.sh:26-32`); the canonical
  hook rejects git-generated messages — `Merge branch …`, default `Revert "…"`,
  `fixup!` (T5, `hooks/commit-msg:29-36`); `.claude/settings.json:25` uses a
  cwd-relative hook path that silently fails open from another cwd (T10).
- **Expected:** hooks validate the subject only and accept legitimate git-generated
  messages.
- **Repro / Notes:** `git commit -m "feat: x" -m "body."` → blocked by the Claude
  hook. WS2.4 — anchor sed to the first `-m`; early-exit for `Merge`/`Revert "`/
  `fixup!`; use `$CLAUDE_PROJECT_DIR` in the settings hook.
- **Status:** open

### [BUG-017] Docs/UI truth reconciliation: conflicting AgentEvent shapes, stale CI claim, inert controls
- [ ] **Severity:** low
- **Area:** docs, renderer
- **File(s):** docs/agent-runtime.md, ROADMAP.md, src/game/command.jsx, src/data/seed.js, src/App.jsx, src/game/analysis.jsx
- **Observation:** two incompatible documented `AgentEvent` shapes (`ROADMAP.md:96` vs
  `docs/agent-runtime.md:34`) while code implements a third convention for approvals
  documented nowhere (SRS M19); stale ROADMAP claim "pull_request trigger only" — the
  workflow also triggers on push to main (T7, `ROADMAP.md:114`); `SYSTEM_STATS` inline
  mock array inside a component file violates the AGENTS.md seed rule, and seed's
  `OBJECTIVES`/`ALERTS` exports are unused (R15, `command.jsx:458`); dead/inert UI
  presented as live — ⚙, minimap zoom, transport, "Open run log", ACTION tiles that
  toast "dispatched" without doing anything (R16).
- **Expected:** one documented event contract; UI affordances either work or are
  visibly disabled; docs match the workflow.
- **Repro / Notes:** WS2.5. BUG-004 documents the `needsApproval` payload as part of
  its fix; this ticket reconciles the rest (single AgentEvent shape in
  agent-runtime.md, ROADMAP marked superseded; fix the CI-trigger sentence;
  move/delete `SYSTEM_STATS`; remove or visibly disable inert controls; wire or delete
  seed `OBJECTIVES`/`ALERTS`).
- **Status:** open

### [BUG-018] Low-severity latent batch (unscheduled in SRS plan)
- [ ] **Severity:** low
- **Area:** renderer, electron
- **File(s):** electron/main/ipcHandlers.cjs, electron/preload/preload.cjs, src/App.jsx, src/game/command.jsx, src/game/theme.jsx, src/game/map.jsx, src/game/analysis.jsx, src/app/activity.js, src/game/branchSelector.jsx
- **Observation:** seven verified-or-reported Low findings the SRS plan of action left
  unscheduled: agent events emitted before the renderer subscribes are dropped with no
  replay channel (M17); 80 ms whole-tree re-render interval when any quest is active —
  currently unreachable, a Phase 6 trap (R11); toast timers never cleared on unmount,
  unbounded queue (R12); `Sparkline` divides by `data.length - 1` (÷0) and `NeonBar`
  has unguarded `value/max` (R18); index keys on reorderable lists (R19); commits older
  than 24 h render bare `HH:MM` (R20); `branchSelector` effect references `wrapperRef`
  declared below it — TDZ trap on refactor (R21).
- **Expected:** latent traps closed before the phases that trigger them land.
- **Repro / Notes:** see SRS §6.2 for line refs. Batch ticket by design — slice freely
  when picked up; none blocks the v1 ship gate.
- **Status:** open

### [BUG-019] Docs and backlog drift after the upstream v1 wave
- [ ] **Severity:** med
- **Area:** docs
- **File(s):** AGENTS.md, README.md, VERIFICATION.md, docs/srs-and-plan-of-action.md, bugs.md, features.md
- **Observation:** eleven upstream commits (`62f67b0..4f7f45e`, the "v1 wave")
  landed between the SRS baseline (`1356437`) and this merge, shipping large parts
  of the SRS plan independently: real `claude` CLI flags + real-output
  `streamEvents` (8c6043e ≈ parts of BUG-003/FEAT-005), Windows shim wrap
  (4f7f45e ≈ BUG-006), a preload contract test (≈ FEAT-010), run history panel
  (02aad50 ≈ parts of FEAT-008), README safety model + troubleshooting
  (a6a31bd = FEAT-002), boot-payload detection (b461642), browser-path removal
  (035490d), Electron 42 (344f4aa). Residual drift: AGENTS.md "Running the app"
  still quotes the deleted `npm run dev` script; README/AGENTS reference the
  deleted `src/game/data.js` shim; VERIFICATION.md Stage 2 baseline counts
  (26 files / 313 cases) and several SRS findings predate the wave; README notes
  Claude runs still use `--permission-mode bypassPermissions` (BUG-004's approval
  boundary remains open).
- **Expected:** docs describe reality; every open ticket's premise re-checked
  against current `main`.
- **Repro / Notes:** run `/protocol-v-and-v` (its freshness audit reconciles
  counts and commands), then re-groom the open backlog against current `main` —
  at minimum re-verify BUG-003/004/005/006 and FEAT-005/008/010 before
  implementing them as filed.
- **Status:** open

---

## Migrated to changelog

Entries below have been ticked off and copied as a one-liner into `CHANGELOG.md`.
They are kept here so each `BUG-NNN` stays resolvable.

### [BUG-001] Preload bridge dead under `sandbox: true` — desktop degrades to browser stub
- [x] **Severity:** high
- **Area:** ipc, electron
- **File(s):** electron/preload/preload.cjs, electron/main/agents/constants.cjs
- **Observation:** `preload.cjs:5` requires `../main/agents/constants.cjs`; sandboxed
  preloads cannot `require` local CJS files, so the bridge throws at load and the
  renderer silently falls back to the browser stub — every desktop feature dead with
  no visible error (SRS M2).
- **Expected:** `window.citybase` is defined in a desktop launch (ROADMAP Phase 1 DoD;
  ship gate FR-V1/FR-V2).
- **Repro / Notes:** launch the desktop app, DevTools console: `window.citybase` →
  undefined. Fix per WS0.1: inline the channel constant in preload.cjs (no local
  requires) + a unit test asserting it equals the `constants.cjs` export. FEAT-001's
  smoke test (`app.getVersion()` resolves) is the permanent guard. Land bundled with
  BUG-002 + FEAT-001.
- **Fix:** fixed upstream in the v1 wave (`preload.cjs` inlines the channel
  literals; drift guarded by `src/tests/preload.contract.test.js`). An equivalent
  local fix was superseded and dropped at merge time. Verified live by the
  FEAT-001 smoke test: the pre-wave baseline launch had `window.citybase` absent;
  current `main` launches with a live bridge (`app.getVersion()` resolves over
  real IPC).
- **Status:** fixed-pending-migration

### [BUG-002] Agent detection always reports "not installed"; `auto` provider always throws
- [x] **Severity:** high
- **Area:** agents
- **File(s):** electron/main/agents/detect.cjs, electron/main/ipcHandlers.cjs, electron/main/ipc.cjs, src/App.jsx
- **Observation:** `detect.cjs:67` defaults `fsExists` to `() => false` and both
  production call sites (`ipcHandlers.cjs:100`, `ipc.cjs:24`) pass no args — settings
  always shows both CLIs "not installed" and `provider: 'auto'` always throws (SRS M3).
  Tests inject stubs, so the glue bug is invisible to the suite. A detect *error*
  renders identically to "not installed" (R17).
- **Expected:** with `claude` on PATH, settings shows "installed" without injected
  stubs (ship gate FR-V6).
- **Repro / Notes:** call `detectAgentBinaries()` with zero args → both not found
  regardless of PATH. Fix per WS0.2: default `fsExists` to a real `fs.existsSync`
  wrapper; add a glue-level zero-arg test; render the detect-error state distinctly.
- **Fix:** the fs default fixed upstream in the v1 wave (`detect.cjs`
  `defaultFsExists` + real-filesystem glue tests + Windows codex-shim
  preference); verified at merge time — a zero-arg `detectAgentBinaries()` finds
  both real CLIs on this machine. The R17 remainder landed here: EmptyHome rows
  and TopBar chips render `detect failed: <message>` distinctly from
  "not installed" (suppressing the misleading install hint), with view tests in
  `src/tests/AgentDetectError.test.jsx`.
- **Status:** fixed-pending-migration

### [BUG-004] Approval boundary never invoked — write-mode runs execute unapproved
- [x] **Severity:** crit
- **Area:** agents, renderer
- **File(s):** electron/main/agents/agentManager.cjs, electron/main/agents/CliAgentAdapter.cjs, src/app/useApprovalRequests.js, src/game/modals.jsx, docs/agent-runtime.md
- **Observation:** no production code calls `requestApproval` or emits
  `payload.needsApproval` (`agentManager.cjs:145`, `CliAgentAdapter.cjs:105`,
  `useApprovalRequests.js:27`) — write-mode runs execute immediately with no approval
  (SRS M1; producers exist only in tests). The renderer dequeues an approval even when
  the approve/reject IPC call fails, orphaning the main-process promise (R3,
  `useApprovalRequests.js:61-77`); the modal backdrop click silently rejects and
  approve-then-backdrop double-fires (R8, `modals.jsx:283`).
- **Expected:** every file-changing agent action passes an explicit approval boundary
  before execution — a hard product constraint (ROADMAP, AGENTS.md, NFR-1;
  VERIFICATION.md Stage 5.4).
- **Repro / Notes:** WS0.4 — for write-mode skills emit `{needsApproval, summary}` and
  `await requestApproval(runId, summary)` before spawning; renderer dequeues only on
  IPC success, re-hydrates from `listPendingApprovals` on failure; disable modal
  buttons after first action; backdrop becomes a no-op; document the payload in
  agent-runtime.md. Test: an edit-skill run does not invoke the CLI until `approveRun`
  fires; the reject path never spawns. Soft dependency on FEAT-004. Hard gate before
  demoing any write-capable run (SRS §8).
- **Fix:** implemented a manager-level pre-flight gate. For `approvalMode: 'ask'`
  (the renderer now sends it on every dispatch) `agentManager.startRun` pre-assigns
  the runId, registers an awaiting-approval placeholder, emits a `needsApproval`
  event, and blocks on `requestApproval` — the adapter's CLI is invoked only on
  approve, with the pre-assigned runId (adapters now honor `params.runId`); reject
  throws and never spawns. `emitEvent` is injected via `ipc.cjs`. Unit-tested
  (emits/waits/approves/rejects/no-gate paths) and verified end-to-end with the
  real `claude` CLI by `scripts/gui-claude-e2e.mjs` (5/5): the modal gates the run,
  Approve lets it proceed, the response renders. R3/R8 renderer hardening already
  landed upstream; full streaming approval remains future (FEAT-004).
- **Status:** fixed-pending-migration

### [BUG-020] Living-city overlay never activated (runs complete synchronously)
- [x] **Severity:** med
- **Area:** renderer
- **File(s):** src/App.jsx, src/app/runCity.js
- **Observation:** the FEAT-016 active-run overlay keyed off a run with
  `status === 'running'`, but the adapters run the CLI to completion before
  `startTask` returns (status jumps straight to `done`/`failed`), so no history
  record is ever observably `running` — the banner and active-building glow
  never fired in real use.
- **Expected:** the city visibly reacts while an agent works.
- **Repro / Notes:** found while wiring FEAT-016; dispatch a run and the overlay
  stays dark.
- **Fix:** App treats an in-flight dispatch (the awaited `startRun`) as the
  active run via a `dispatchingProvider` state, so the banner + live snapshot
  refresh activate during the dispatch window; a real `running` history record
  still wins when one exists. Full frame-by-frame streaming still depends on
  non-blocking dispatch (FEAT-004).
- **Status:** fixed-pending-migration

### [BUG-021] produceDiff omits agent-created (untracked) files
- [x] **Severity:** high
- **Area:** agents
- **File(s):** electron/main/agents/CliAgentAdapter.cjs, src/tests/ClaudeAdapter.test.js, src/tests/CodexAdapter.test.js
- **Observation:** `produceDiff` ran `git diff --unified=3 --no-color`, which
  ignores untracked files. Creating new files is the most common agent output,
  so the RunDetail diff panel showed "no file changes" for those runs — the
  primary review artifact was wrong. Caught by the real-Claude integration
  harness (`scripts/claude-e2e.mjs`): a run that created a file produced an
  empty diff.
- **Expected:** the diff surfaces every change the agent made, including new files.
- **Repro / Notes:** `node scripts/claude-e2e.mjs` (needs an authenticated
  `claude`) — pre-fix the "produceDiff returns the changed file" check failed.
- **Fix:** before diffing, mark untracked files intent-to-add
  (`git add --intent-to-add`) so new files render as additions, then
  `git reset --quiet` them to leave the index unchanged. Harness now 10/10;
  added unit coverage for the untracked path.
- **Status:** fixed-pending-migration

### [BUG-022] RunDetail Events panel empty after a run (no event replay)
- [x] **Severity:** high
- **Area:** agents, renderer
- **File(s):** electron/main/agents/agentManager.cjs, electron/main/ipcHandlers.cjs, electron/preload/preload.cjs, src/views/RunDetail.jsx
- **Observation:** runs complete synchronously, so `pumpAgentEvents` fans the
  event stream out before RunDetail mounts and subscribes via `useRunEvents` —
  and there is no replay, so the Events panel always showed "no events" for a
  finished run (the agent's response never appeared, only the diff). Caught by
  the GUI integration test (`scripts/gui-claude-e2e.mjs`).
- **Expected:** a finished run shows its event trail / the agent's response.
- **Repro / Notes:** dispatch any run; RunDetail Events panel stays empty.
- **Fix:** added `agentManager.getEvents(runId)` (collects the adapter stream),
  exposed it over IPC + preload, and RunDetail loads it on terminal as a
  backstop (live stream still wins when present). Verified: the real Claude
  response now renders in Events.
- **Status:** fixed-pending-migration

### [BUG-023] 'auto' provider resolved to codex, not the documented claude default
- [x] **Severity:** med
- **Area:** agents
- **File(s):** electron/main/agents/resolveProvider.cjs, src/tests/resolveProvider.test.js
- **Observation:** `PREFERRED_ORDER` was `['codex', 'claude']`, so with both CLIs
  installed `provider: 'auto'` picked codex — contradicting the v1 ship gate and
  `docs/agent-runtime.md`, which name Claude Code the default first-run provider.
- **Expected:** `auto` prefers claude when installed.
- **Repro / Notes:** found via the GUI test (auto runs went to codex).
- **Fix:** `PREFERRED_ORDER = ['claude', 'codex']`; updated tests.
- **Status:** fixed-pending-migration

### [BUG-024] Agent install indicator stuck on "not installed" while runs succeed
- [x] **Severity:** med
- **Area:** renderer
- **File(s):** src/app/useAgentDetect.js, src/tests/useAgentDetect.test.jsx, src/tests/AppAutoBoot.test.jsx
- **Observation:** `useAgentDetect` trusted the boot payload's detect result and
  skipped the live probe entirely when seeded. The boot payload (built once at
  did-finish-load) was observed reporting "not installed" while a fresh detect —
  and actual runs — found the CLIs, leaving the top-bar indicator wrong with no
  way to self-correct. Caught by the GUI test (top bar said not-installed after
  a successful claude run).
- **Expected:** the indicator reflects reality.
- **Repro / Notes:** GUI test top bar vs a successful run.
- **Fix:** seed first paint from the boot payload (keeps the v1 auto-boot
  instant render) but always confirm with a non-blocking live probe that
  self-heals a stale/empty seed; a transient null/error never wipes a good seed.
- **Status:** fixed-pending-migration

### [BUG-025] City fails to light streamed files when the drive-letter case differs (Windows)
- [x] **Severity:** med
- **Area:** renderer, city
- **File(s):** src/app/runCity.js, src/tests/runCity.test.js
- **Observation:** `toRepoRelative` stripped the workspace root with a
  case-sensitive prefix match. On Windows the agent can emit `C:\...` while the
  stored root is `c:\...` (drive-letter case drifts between Node and git), so the
  match failed and the path stayed absolute — never matching a city building, so
  the exact-file glow (FEAT-005) silently fell back to the 2.5s dirty-file scan.
- **Expected:** the streamed path relativizes regardless of drive-letter case.
- **Repro / Notes:** surfaced by the v3 adversarial review; the suffix must keep
  its real case (city building paths come from git).
- **Fix:** match the root case-insensitively, slicing the original (cased) path
  so the suffix is preserved.
- **Status:** fixed-pending-migration

### [BUG-026] runStore concurrent saves race on the shared temp file — corrupt runs.json
- [x] **Severity:** high
- **Area:** electron, persistence
- **File(s):** electron/main/services/runStore.cjs, electron/main/ipc.cjs, src/tests/runStore.test.js
- **Observation:** every run settling fires a best-effort `save()` that writes the
  full history to `${file}.tmp` then renames. Two near-simultaneous settles
  (common when runs end together) both wrote the same temp path; the interleaved
  writes could rename a half-written file into place, corrupting `runs.json`
  (recoverable only by the load-path's catch → start empty, i.e. silent history
  loss). The persist failure was also swallowed (`.catch(() => {})`).
- **Expected:** concurrent saves never interleave; persist failures are visible.
- **Repro / Notes:** surfaced by the v3 adversarial review. (The review's "Windows
  rename fails on an existing target" premise was wrong — Node's `fs.rename` uses
  MOVEFILE_REPLACE_EXISTING — but the shared-temp race is real.)
- **Fix:** serialize writes through a promise chain in `runStore` (the chain
  stays alive across a failed write); surface persist errors via `console.error`.
- **Status:** fixed-pending-migration

### [BUG-027] ClaudeAdapter final-event correctness: raw NDJSON dump + mislabeled timeout
- [x] **Severity:** med
- **Area:** agents
- **File(s):** electron/main/agents/ClaudeAdapter.cjs, src/tests/ClaudeAdapter.test.js
- **Observation:** two defects in `_finalize`. (1) A run that passes having surfaced
  no events (e.g. claude emits only a success `result` line) re-parsed the *whole*
  multi-line NDJSON stdout with `JSON.parse`, which fails, so the raw NDJSON stream
  was dumped into the panel as the "output". (2) A run killed by timeout that had
  already streamed events was labelled with the generic "non-zero status" message
  instead of a timeout-specific one.
- **Expected:** prefer the parsed `result` text; name a timeout a timeout.
- **Repro / Notes:** surfaced by the v3 adversarial review.
- **Fix:** in the zero-events success path prefer `entry.claudeResult.result`
  over re-parsing stdout; in the events-present failure path emit the
  timeout-specific message when `exitState === 'timeout'`.
- **Status:** fixed-pending-migration

### [BUG-028] Rejected approval run not persisted — cancelled record vanishes on restart
- [x] **Severity:** low
- **Area:** agents, persistence
- **File(s):** electron/main/agents/agentManager.cjs, src/tests/agentManager.test.js
- **Observation:** rejecting an approval set the history entry's status to
  `cancelled` but never called `doPersist()` (the run throws before reaching
  `captureWhenDone`). The in-session Run History showed the cancelled run, but it
  disappeared on the next launch — inconsistent with every other terminal run.
- **Expected:** the cancelled record survives a restart like any terminal run.
- **Repro / Notes:** surfaced by the v3 adversarial review.
- **Fix:** call `doPersist()` in the rejection branch of `startRun`.
- **Status:** fixed-pending-migration

### [BUG-029] Agent-run robustness hardening (timeout, line buffer, swallowed errors)
- [x] **Severity:** low
- **Area:** agents, electron
- **File(s):** electron/main/agents/CliAgentAdapter.cjs, electron/main/agents/ClaudeAdapter.cjs
- **Observation:** a cluster of robustness gaps surfaced by the v3 adversarial
  review: (1) the default task timeout was 10 min, short enough to kill a
  legitimate long agent run mid-flight; (2) `spawnStream` forwards every chunk to
  the NDJSON line buffer uncapped (its 16MB cap only bounds the buffered stdout),
  so a pathological no-newline stream could grow the buffer without bound; (3) a
  throw in the stdout-parse hook was swallowed silently, hiding real adapter bugs.
- **Expected:** generous-but-bounded timeout; bounded line buffer; visible errors.
- **Repro / Notes:** none are routinely hit; defence-in-depth hardening.
- **Fix:** raise the default timeout 10→30 min (cancel still works as the escape
  hatch); bound the partial-line buffer at 32MB with a truncation event; log
  swallowed stdout-parse errors via `console.error`.
- **Status:** fixed-pending-migration

### [BUG-008] District footprints overlap on real repos; building 12 wraps onto center tile
- [x] **Severity:** high
- **Area:** renderer
- **File(s):** (historical) src/app/cityModel.js, src/game/map.jsx, src/tests/cityModel.test.js
- **Observation:** district seats 1 hex apart but each district drew a radius-≤2 tile
  cluster, so adjacent footprints overlapped and buildings landed on identical tiles;
  an off-by-one wrapped the 12th building onto the center/label tile. Both defect sites
  lived in `src/game/map.jsx`.
- **Resolution:** obsoleted-then-resolved by the v2.0 "Living City" rebuild (FEAT-014):
  `src/game/map.jsx` was deleted and the renderer replaced by `src/views/CityView.jsx`
  + `src/app/cityModel.js`. The 2026-06-18 adversarial re-groom verified — by
  enumerating every adjacent seat pair — that districts seat at spacing 6.2 world units
  against a ≤4.7 platform footprint (tightest single-axis gap 5.369 > 4.7, no overlap),
  core is a distinct origin platform, and buildings use a centered Cartesian grid with
  no center tile and no modular wrap. Guarded by `iso.test.js` (BUG-008 separation
  guard) + `CityView.test.jsx`.
- **Status:** fixed-pending-migration

### [BUG-012] Modal and feed hygiene: stale picked adventurer, frozen times, mock leftovers, seed districts
- [x] **Severity:** med
- **Area:** renderer
- **File(s):** (historical) src/game/modals.jsx, src/App.jsx, src/app/activity.js
- **Observation:** stale picked adventurer in `QuestDetailModal`, frozen relative
  commit times, mock leftovers in the activity handlers, and quest modals targeting
  seed `DISTRICTS` that don't exist in the projected city.
- **Resolution:** obsolete — every symptom was bound to the quest/adventurer metaphor
  UI, which the v2.0 City/Work rebuild removed wholesale: `src/app/activity.js` deleted,
  `QuestDetailModal`/`PostQuestModal` removed from `modals.jsx` (now only `ApprovalModal`
  + `Toasts`), and the city is projected from real Git state rather than seed
  `DISTRICTS`. The 2026-06-18 re-groom confirmed the premise was genuine at baseline
  (`git show 1356437:src/app/activity.js` exists) and that no carrier of any sub-defect
  survives. Closed as obsolete by removal.
- **Status:** fixed-pending-migration
