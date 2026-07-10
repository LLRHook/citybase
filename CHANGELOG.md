# Changelog

Bug fixes are migrated here from `bugs.md` once verified. Features are
migrated from `features.md`. Each entry keeps the original `BUG-<id>` /
`FEAT-<id>` so history can be traced both ways.

The format is loosely [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
with `Verified`, `Added`, `Changed`, `Fixed`, `Removed`, and `Security`
sections under each release/date heading.

---

## Unreleased

### Added

- FEAT-020 Streaming run detail: live runs render a "Live Activity" panel —
  events append incrementally with tail-follow auto-scroll and a
  reduced-motion-safe working indicator; terminal state swaps to the review
  surface with `getEvents` as the re-mount backstop.
- Phase 4 no-code review surface (v1 ship gate): RunDetail's terminal view
  leads with Outcome (agent summary + explainable risk via the pure
  `src/app/reviewModel.js`) and Changed Districts (files grouped by the
  city's district convention); raw diff hunks and the agent log moved to
  collapsed drawers.
- FEAT-022 `citybase-core`: the agent harness extracted into a headless
  daemon (`npm run core`) serving the `citybase:*` handler map as JSON-RPC
  over a token-gated loopback WebSocket (`ws@8.21`), sharing services,
  approval boundary, and userData state with the Electron shell;
  `workspace.registerPath` added for headless frontends; a protocol
  conformance test guards preload ⇄ handler-map parity.
- FEAT-023 Godot 4.7 spike (v4 Phase B gate — **GO**): `godot/` spawns the
  core, speaks the WS protocol, renders the real repo as a lit 3D city,
  glows the exact building a live claude tool-use touches at 60 fps, and the
  packaged `--export-release` macOS app runs the full flow outside the
  editor. Gate results in docs/v4-game-engine.md.

- FEAT-010 Bridge contract parity: realized by `coreProtocol.test.js` —
  preload channels and the handler map are asserted against each other in
  both directions with a headless-only whitelist.

### Verified

- 2026-07-10 V&V pass (v1-gate closure + v4 phase A/B waves): Stages 0–5
  green after two in-pass fixes. 440 Vitest cases across 36 files, Playwright
  desktop smoke, lint zero-error across the renderer/electron/core/scripts
  tiers, build clean; renderer isolation / IPC allow-list / single-spawn-site
  / no-telemetry invariants re-confirmed (telemetry grep rescoped to exclude
  test fixtures — the production surface is exactly the Help-menu link).
  Real-`claude` harnesses: `claude-e2e` 13/13; `gui-claude-e2e` 5/5 after the
  pass caught BUG-030 and BUG-031 — both fixed and regression-tested
  in-pass. Baseline bumped 393 → 440 (incl. the same-cycle hygiene batch). Doc drift fixed
  (AGENTS.md / CLAUDE.md / ROADMAP / VERIFICATION); runtime-deps rule now
  react + react-dom + ws.
- 2026-06-18 V&V pass (SHA `31c4014`, v3.0.0 + post-cut hardening): Stages 0–5
  green. 393 Vitest cases across 30 files, 1 Playwright desktop smoke, lint +
  build clean, renderer isolation / IPC allow-list / single-spawn-site /
  no-telemetry invariants re-confirmed. Real-`claude` harnesses green:
  `claude-e2e` 13/13 (detect → non-blocking dispatch → live stream → diff →
  checks), `gui-claude-e2e` 5/5 (approval gate + live stream in RunDetail + diff
  + city glow). Baseline bumped 380 → 393 (FEAT-005 streaming-event tests +7,
  BUG-025..029 regression tests +6). Five defects found by an adversarial
  multi-agent review of the v3 changes and fixed this cycle (BUG-025..029).

### Fixed

- BUG-009 Git runs with `-c core.quotePath=false` on the path-parsing
  surfaces (status snapshot, produceDiff), so unicode/accented filenames reach
  the parsers raw instead of C-quoted; unicode + rename fixtures lock it in.
- BUG-013 `workspaces.json` mutations are serialized as read-modify-write
  units and written atomically (temp + rename) in `workspaceServiceCore`,
  with first unit tests incl. the concurrent-register lost-update race.
- BUG-016 Commit hooks fixed: the Claude PreToolUse hook validates the FIRST
  `-m` (the subject, not the body), the canonical hook accepts git-generated
  Merge/Revert/fixup!/squash! messages, and the settings hook path is
  anchored to `$CLAUDE_PROJECT_DIR` (it was silently failing open from
  worktree cwds).
- BUG-005 `agent.startRun` no longer spawns in a renderer-supplied cwd: the
  handler takes a `workspaceId`, resolves it against the known-workspace
  registry (unknown ids rejected before the manager is touched), and ignores
  any renderer-supplied `repoUrl`.
- BUG-007 Broken workspace/git states now render as an explicit
  `WorkspaceStatusPanel` (not-a-repo / git missing / snapshot IPC failure)
  with retry/pick affordances; the TopBar pill reads amber `· git error`
  instead of linked green; `useWorkspace` hydrate/refresh/close route
  failures to the error state (no more stranded `loading`) and the dead
  no-arg `git.refresh()` pre-call is gone.
- BUG-015 The `electron/`, `core/`, and `scripts/` tiers are linted
  (commonjs + node globals); the 15 findings it surfaced were fixed.
- BUG-017 Closed: ROADMAP's adapter-contract sketch carries an explicit
  "superseded by docs/agent-runtime.md" note; the stale CI-trigger claim and
  the inert-controls carriers no longer exist.
- BUG-019 Closed by the 2026-07-10 V&V doc pass: AGENTS.md / CLAUDE.md /
  VERIFICATION.md describe the live-data, post-seed, two-view reality with
  refreshed baselines and commands.
- BUG-030 `gui-claude-e2e` seeded the Windows-only userData path — on macOS
  the run executed against the user's real workspace and the diff check
  passed vacuously on prompt text. Platform-correct path + the check now
  waits for the terminal pill and asserts inside Changed Districts.
- BUG-031 Run status no longer sticks on `running` after settle: the manager
  emits a final `agent run settled · <status>` event at the terminal
  transition, so the history refresh, RunDetail, and city overlay all see
  the flip within a second.
- BUG-008 Verified resolved by the v2.0 city rebuild (FEAT-014) and closed during the
  2026-06-18 re-groom: districts seat at 6.2 world units against a ≤4.7 footprint (no
  overlap, proven by enumerating adjacent seats) and buildings use a center-tile-free
  Cartesian grid. The old `src/game/map.jsx` defect sites are deleted.
- BUG-012 Closed as obsolete: the quest/adventurer surface it described
  (`src/app/activity.js`, QuestDetailModal, seed `DISTRICTS`) was removed in the v2.0
  City/Work rebuild; no carrier of any sub-defect survives.
- BUG-025 City exact-file glow now relativizes streamed agent paths
  case-insensitively, so a Windows drive-letter case mismatch (`C:\` vs `c:\`)
  no longer leaves the path absolute and unmatched to a building.
- BUG-026 `runStore` serializes concurrent saves through a promise chain, so two
  runs settling together can no longer interleave writes to the shared temp file
  and corrupt `runs.json`; persist failures are now logged, not swallowed.
- BUG-027 ClaudeAdapter `_finalize` prefers the parsed `result` text over
  re-parsing the full NDJSON stream (no more raw-stream dump on a zero-event
  success), and names a timeout a timeout when events had already streamed.
- BUG-028 A rejected approval run now persists its `cancelled` record, so it
  survives a restart instead of vanishing from the Run History panel.
- BUG-029 Agent-run robustness: default task timeout raised 10→30 min, the NDJSON
  line buffer is bounded at 32MB, and a throw in the stdout-parse hook is logged
  rather than silently swallowed.

## 3.0.0 — "Real-Time City"

The workbench goes real-time and durable. Agent dispatch is non-blocking and
streaming, the city animates live as the agent works, runs can be cancelled for
real, and run history survives restarts.

### Verified

- 2026-06-15 V&V pass (SHA `0e20a02`, v3.0.0): Stages 0–5 green. 380 Vitest cases
  across 30 files, 1 Playwright desktop smoke, lint + build clean, renderer
  isolation / IPC allow-list / single-spawn-site / no-telemetry invariants
  re-confirmed. Real-`claude` harnesses green: `claude-e2e` 11/11 (incl.
  running→done non-blocking lifecycle), `gui-claude-e2e` 5/5 (approval gate +
  live mid-run city + persisted `runs.json`). Baseline bumped 361 → 380.

### Added

- FEAT-004 Streaming process runner (`processService.spawnStream`): non-blocking,
  line-streamed, killable child processes (Windows `taskkill /t`, POSIX
  SIGTERM→SIGKILL), alongside the buffered `run` git/checks keep using.
- FEAT-008 Run history persisted across restarts (`runStore`, atomic writes); the
  manager seeds from disk on boot and replays historical runs' recorded events.
- FEAT-019 Live agent presence in the city: a scanning marker over the area being
  worked while a run is active, plus a completion ripple — respecting
  `prefers-reduced-motion`.
- FEAT-005 Live token-by-token events: ClaudeAdapter streams `--output-format
  stream-json`, parsing each NDJSON line into a real AgentEvent as it arrives, so
  RunDetail fills in live while the run is `running`. Tool uses carry the exact
  `file_path`, so the city lights the precise building claude touches the instant
  it touches it — ahead of the snapshot refresh.

### Changed

- Agent dispatch is now **non-blocking and streaming**: `startRun` returns a
  `running` run immediately, status flips live (`running → done/failed/cancelled`)
  through the shared run reference, and the city animates throughout. Version
  bumped to 3.0.0.

### Fixed

- BUG-003 (partial) Agent runs no longer block the UI until exit, are no longer
  SIGTERM'd at the 15s git timeout (10-min configurable cap via `spawnStream`),
  and `cancel` is reachable mid-run and actually terminates the child process.

## 2.0.0 — "The Living City"

### Verified

- 2026-06-15 V&V pass (SHA `0fb551d`): Stages 0–5 green. 361 Vitest cases across
  29 files (jsdom), 1 Playwright desktop smoke, lint + build clean, renderer
  isolation / IPC allow-list / single-spawn-site / no-telemetry invariants
  re-confirmed. Agent path verified against the real `claude` CLI by the
  integration harnesses (`scripts/claude-e2e.mjs` 10/10, `scripts/gui-claude-e2e.mjs`
  5/5 incl. the approval gate). Test baseline bumped 313 → 361 in VERIFICATION.md.

### Added

- FEAT-013 City projection model (`cityModel.js` + `hex.js` + `iso.js`): pure,
  deterministic projection from the live Git snapshot (tracked tree + dirty
  files) to districts and buildings.
- FEAT-014 Isometric `CityView` — the v2.0 centerpiece. Real-data 2.5D city:
  folders are districts on raised slabs, files are extruded buildings (towers
  taller), dirty files glow (staged green / unstaged amber), with pan/zoom,
  hover, selection, an iso ground grid, and depth lighting.
- FEAT-015 City / Work segmented navigation in the top bar; the city is the
  default landing for an open workspace.
- FEAT-016 Living agent runs: while an agent runs, the workspace snapshot
  auto-refreshes so the buildings it edits light up in near-real time, and an
  "agent at work" banner shows the provider and run phase.

### Changed

- The renderer is now a two-surface app (City + Work) instead of a single run
  form; the Work view (run dispatch, run detail, commit) is centered with an
  ambient backdrop. Version bumped to 2.0.0.

### Fixed

- BUG-004 Wired the approval boundary: write-capable agent runs now pause for
  explicit user approval before the CLI spawns. A manager-level pre-flight gate
  emits a `needsApproval` event and blocks on `requestApproval`; the adapter is
  invoked only on approve (rejecting never spawns). Verified end-to-end against
  the real `claude` CLI.
- BUG-020 Living-city overlay now activates during an in-flight dispatch
  (runs complete synchronously, so no history record was ever observably
  `running`); the banner and live snapshot refresh fire while the agent works.
- BUG-021 `produceDiff` now includes agent-created (untracked) files via
  intent-to-add, so the RunDetail diff surfaces new files instead of showing
  "no file changes" — verified against the real `claude` CLI by
  `scripts/claude-e2e.mjs`.
- BUG-022 RunDetail now backfills a finished run's event trail via
  `agents.getEvents`, so the agent's response shows even though synchronous runs
  fan out their events before the view subscribes.
- BUG-023 `auto` provider resolution now prefers Claude (the documented v1
  default) over Codex when both are installed.
- BUG-024 The agent install indicator self-heals: it seeds from the boot payload
  for an instant paint but confirms with a live probe, so a stale "not installed"
  seed no longer sticks while runs succeed.

### Removed

### Security
