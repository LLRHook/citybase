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

- FEAT-022 Citybase Model Shop: procedural 3D model town with balsa base and drafting props, Pip walking/ground travel/hopping, camera orbit/zoom and day/lamp controls, a four-step playable first shift, painted Claude/Codex crew tokens, building assignment and real local work orders.
- Survey/Craft/Mend skill ledgers with persisted, idempotent reward receipts. Survey rewards require real assistant output; crafting rewards require observed repository change. Game levels do not change model capabilities.
- Custom Model Shop icon in SVG/PNG, matching favicon and native macOS ICNS; Electron window and Dock use the icon.
- Read-only, bounded real-file inspection and HEAD diffs, including staged/unstaged changes and untracked files. Fonts are bundled for offline operation.

### Changed

- Three.js 0.185.1 supplies real depth, lighting, camera controls and instanced architecture. React/Electron, renderer isolation and local CLI execution remain the foundation.
- The primary interface is now the playable model shop. Legacy branch/commit/PR/check panels are not part of the new game loop.


### Verified

- 2026-09-05 FEAT-022 checkpoint: lint and production build pass; the full 435-case / 35-file suite passed, followed by 6 new camera regression cases and targeted changed-component checks. The current collector contains 441 cases across 37 files. Four real Electron journeys pass; the final approval/streaming/reward/reject/recall journey was rechecked after icon and dialog integration (1 passed in 19.9 seconds), using isolated Git repositories and an explicitly labeled CLI test fixture for repeatable approval/streaming/recall/reward persistence. Separate authenticated Codex runs verified a real survey and one-file crafting outcome. The final Model Shop was visually inspected in Electron against the actual repository, including loaded local fonts and app icon. Three.js retains an advisory bundle-size warning; this checkpoint does not claim a new full historical V&V protocol or signed release packaging pass.

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

- BUG-003 Codex activity now comes from parsed real JSON events; fabricated successful edits/tests/PR trails are gone.
- BUG-005 Agent execution resolves a remembered workspace ID in the main process instead of trusting a renderer-supplied path.
- BUG-007 Workspace hydration/refresh errors remain visible and refresh passes the correct workspace ID.
- BUG-030 Approval summaries, terminal status notifications, rejection/cancellation and persistent quest identity now agree between live play and restored history.
- BUG-031 Selected file content and camera state survive Git refreshes, and README matches the new playable interface.

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
