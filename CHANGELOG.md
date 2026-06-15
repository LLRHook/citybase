# Changelog

Bug fixes are migrated here from `bugs.md` once verified. Features are
migrated from `features.md`. Each entry keeps the original `BUG-<id>` /
`FEAT-<id>` so history can be traced both ways.

The format is loosely [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
with `Verified`, `Added`, `Changed`, `Fixed`, `Removed`, and `Security`
sections under each release/date heading.

---

## Unreleased

### Verified

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

- BUG-020 Living-city overlay now activates during an in-flight dispatch
  (runs complete synchronously, so no history record was ever observably
  `running`); the banner and live snapshot refresh fire while the agent works.
- BUG-021 `produceDiff` now includes agent-created (untracked) files via
  intent-to-add, so the RunDetail diff surfaces new files instead of showing
  "no file changes" — verified against the real `claude` CLI by
  `scripts/claude-e2e.mjs`.

### Removed

### Security
