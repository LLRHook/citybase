# Changelog

Bug fixes are migrated here from `bugs.md` once verified. Features are
migrated from `features.md`. Each entry keeps the original `BUG-<id>` /
`FEAT-<id>` so history can be traced both ways.

The format is loosely [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
with `Verified`, `Added`, `Changed`, `Fixed`, `Removed`, and `Security`
sections under each release/date heading.

---

## Unreleased

## 3.0.0 — "Real-Time City"

The workbench goes real-time and durable. Agent dispatch is non-blocking and
streaming, the city animates live as the agent works, runs can be cancelled for
real, and run history survives restarts.

### Added

- FEAT-004 Streaming process runner (`processService.spawnStream`): non-blocking,
  line-streamed, killable child processes (Windows `taskkill /t`, POSIX
  SIGTERM→SIGKILL), alongside the buffered `run` git/checks keep using.
- FEAT-008 Run history persisted across restarts (`runStore`, atomic writes); the
  manager seeds from disk on boot and replays historical runs' recorded events.
- FEAT-019 Live agent presence in the city: a scanning marker over the area being
  worked while a run is active, plus a completion ripple — respecting
  `prefers-reduced-motion`.

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
