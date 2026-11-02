# Citybase — Bug Tracker

Active work only. Format and rules: [`.cycle/TRACKERS.md`](.cycle/TRACKERS.md). Write with `python .cycle/trackers.py`, never by hand. Shipped and closed entries are removed; their record is `CHANGELOG.md`, Jira, and `python .cycle/trackers.py show <id>`.

## Open

### [BUG-042] Default Godot camera clips the edge of a small city
- [ ] **Severity:** low
- **Area:** renderer
- **File(s):** `godot/camera_rig.gd`, `godot/main.gd`
- **Observation:** At the default 1480×960 viewport, the final 23-file Minecraft trial cities have three and four districts respectively, but part of the outer `core` district falls below the bottom edge on initial load. The complete level/XP HUD remains visible. This occurred in both concurrent frontend captures using the unmodified production camera.
- **Expected:** Initial framing should contain the complete small city within the viewport, with room for its HUD.
- **Req:** CB-FR-002
- **Depends on:** none documented in original finding
- **Repro / Notes:** Open either completed 23-file trial workspace with its copied eight-run profile. Default screenshots are preserved under `build/minecraft-validation-20260909/godot/final-a-20260909-015927-shots/city-99-final.png` and `final-b-20260909-015927-shots/city-99-final.png`. Seven steps of the existing wheel-zoom-out control bring the district platforms into the viewport; separately labeled `city-zoomed-out.png` captures preserve that workaround. The `frame_radius()` distance factor is a suspected cause, not a confirmed diagnosis. No production camera changes were made during validation.
- **Bump:** patch
- **Status:** open

### [BUG-037] XP is calculated from a truncated run-history window
- [ ] **Severity:** med
- **Area:** agents
- **File(s):** `godot/living_layer.gd`, `godot/main.gd`, `electron/main/agents/agentManager.cjs`, `electron/main/services/runStore.cjs`
- **Observation:** Godot derives XP from `agent.listRuns` with its default 50-run limit. Fifty successful runs yield only 1,250 XP (level 6); newer unsuccessful runs can displace successful ones and reduce the level. Persisted history is also capped at 100 terminal records.
- **Expected:** Earned progression should remain stable as history is pruned. This needs durable aggregate progression independent of the activity-list limit.
- **Req:** CB-FR-010
- **Depends on:** none documented in original finding
- **Repro / Notes:** Boundary checks are separate from the live eight-task Minecraft trials. This validation does not implement a new progression store.
- **Bump:** patch
- **Status:** open
- **Log:**
  - Status note:

    ### Re-groom 2026-06-18 — disposition (verified against `main` @ `31c4014`)

    _Filed 2026-06-11 from [docs/srs-and-plan-of-action.md](./docs/srs-and-plan-of-action.md)
    (SRS v0.1, baseline `main` @ `1356437`). Finding ids (M/R/T-series) and workstream
    ids (WS) reference that document._

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

    ### Groom 2026-07-10 — disposition (with the V&V pass, post v1-gate closure + v4 A/B)

    BUG-005/007/015/017/019 fixed and migrated this cycle; BUG-030/031 found by
    the V&V run, fixed in-pass, migrated. What remains, re-verified and ordered:

    | Ticket | Disposition | Priority order | Notes |
    |--------|-------------|----------------|-------|
    | BUG-013 | current (med) | **1 — this batch** | now easier: the registry lives in the pure `workspaceServiceCore` factory with tests; apply the runStore serialize + temp-rename pattern |
    | BUG-009 | current (med) | **2 — this batch** | `-c core.quotePath=false` on status/diff/log + unicode/rename fixtures |
    | BUG-016 | partial (med) | **3 — this batch** | first-`-m` anchor, Merge/Revert/fixup! allowlist, `$CLAUDE_PROJECT_DIR` hook path |
    | FEAT-024 | new (high) | **4 — next PR(s)** | v4 Phase C: the real 3D city (the epic centerpiece) |
    | BUG-011 | current (med) | 5 | branch-selector request token + reset on workspace switch |
    | BUG-014 | partial (med) | 6 | prune the adapter `_runs` map on cancel/evict |
    | BUG-018 | partial (low) | 7 | residual = R12 toast timers, R20 bare `HH:MM`, R21 TDZ; M17 is resolved (the `getEvents` replay + BUG-031 settle event) |
    | FEAT-007 | open (med) | 8 | CI Node 22 + `engines` pin |
    | FEAT-011 | open (med) | 9 | Vitest env split + coverage + non-watch default |
    | FEAT-006 | open (med) | 10 — before any distributed build | nav guards, CSP, self-hosted fonts |
    | FEAT-025/026/027 | new | after FEAT-024 | v4 Phases D/E/F |
    | BUG-003 | partial (med) | capacity | codex synthesized trail (codex is not ship-critical) |
    | BUG-006 | partial (med) | needs the Windows box | bare `npm`/`gh` in checks on win32 |
    | BUG-010 | partial (low) | capacity | `kind` taxonomy on the buffered envelope |
    | FEAT-009 | open (med, shrunk) | capacity | `WorkspaceErrorStates.test.jsx` now covers the R4/R5 regressions; residual = token-race cases |
    | FEAT-010 | **resolved → close** | — | realized by `src/tests/coreProtocol.test.js` (preload ⇄ handler-map parity; the browser stub it wanted to check no longer exists) |
    | FEAT-017 | deferred | — | Electron-city design polish is superseded by the v4 Godot direction; revisit only if v4 stalls |
    | FEAT-003 / FEAT-012 | tracked deferrals (low) | — | packaging + CI ergonomics |

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
- **Req:** CB-FR-007
- **Depends on:** none documented in original finding
- **Repro / Notes:** depends on FEAT-004 (streaming runner). Register the run *before*
  spawning; configurable/disabled timeout for agent runs; delete the fabricated trail.
  Acceptance per WS0.3: a long-running fake CLI cancels within seconds; events reflect
  the actual exit state; checks tolerate slow test suites.
- **Bump:** patch
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
- **Req:** CB-NFR-002
- **Depends on:** none documented in original finding
- **Repro / Notes:** WS1.3 — add `kind: 'not-found'|'timeout'|'non-zero'|'killed'|'output-truncated'`
  to the envelope; propagate `err.code` verbatim; derive `timedOut` from the configured
  timer; surface truncation; update `workspaceChecks.metaFor` and gitService's "git not
  available" guess. Direct tests for `processService.run` (none exist today, SRS §6.5).
- **Bump:** patch
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
- **Req:** CB-FR-004
- **Depends on:** none documented in original finding
- **Repro / Notes:** switch between two workspaces, open the selector. WS1.4 — reset
  list/status on `workspaceId` change, guard with a request token, clear
  `selectedBranch` on switch.
- **Bump:** patch
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
- **Req:** CB-NFR-002
- **Depends on:** none documented in original finding
- **Repro / Notes:** WS1.7 — evict completed runs (LRU/TTL); cancel releases adapter
  state; require adapters to return a runId or pass the manager's id into `startTask`.
  FEAT-008 (run persistence) can double as the eviction store.
- **Bump:** patch
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
- **Req:** CB-NFR-005
- **Depends on:** none documented in original finding
- **Repro / Notes:** see SRS §6.2 for line refs. Batch ticket by design — slice freely
  when picked up; none blocks the v1 ship gate.
- **Bump:** patch
- **Status:** open

### [BUG-1793649547] Living documentation contradicts the current runtime
- [x] **Severity:** med
- **Area:** docs
- **File(s):** AGENTS.md, CLAUDE.md, docs/domain-model.md, docs/agent-runtime.md, ROADMAP.md, VERIFICATION.md
- **Observation:** Living instructions describe seed data, an SDK adapter and monolithic React state; the code uses live Git, CLI adapters, hooks and a Godot frontend.
- **Expected:** Living documentation describes actual runtime contracts, current commands and limits; historical records remain intact.
- **Req:** Owner request 2026-11-02: complete foundation documentation; docs/v4-game-engine.md
- **Depends on:** none
- **Repro / Notes:** Compare named documents with src/app, core/server.cjs, godot/main.gd and electron/main/agents.
- **Bump:** patch
- **Assignee:** Victor Ivanov
- **Status:** fixed-pending-migration
- **Fix:** Living instructions, domain/runtime docs, roadmap and verification match the shared Godot/Node and legacy Electron implementation; historical source text is preserved.
- **Docs:** AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md, ROADMAP.md, VERIFICATION.md, docs/domain-model.md, docs/agent-runtime.md
