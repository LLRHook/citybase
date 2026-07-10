# Citybase — Feature Tracker

This file is the working list of features to implement. New features are appended
here as they are scoped. When a feature is shipped, tick its checkbox and migrate
the entry (with the implementation note) to `CHANGELOG.md` so this file stays
focused on outstanding work.

## Conventions

Each entry uses the form:

```
### [<id>] <short title>
- [ ] **Priority:** crit | high | med | low
- **Area:** renderer | electron | ipc | agents | git | tests | docs | build
- **File(s):** comma-separated paths the feature will create or modify
- **Why:** product / user motivation, with spec section if relevant
- **Approach:** the design — concrete enough that an implementer doesn't have to ask
- **Library / dependency notes:** evaluation of any third-party deps,
  with the recommendation called out explicitly
- **Acceptance criteria:** bullet checklist of what "done" means
- **Test plan:** unit / integration / E2E coverage to land with the feature
- **Out of scope:** explicit "we are NOT doing X in this ticket"
- **Status:** open | in-progress | shipped-pending-migration
```

Tick `- [x]` once verified shipped. The implementer also adds an
`**Implementation:**` line summarising the diff before migrating the entry to
`CHANGELOG.md`.

Priority guide: crit / high / med / low.

## Lifecycle
1. **File:** new entries under `## Open` with the full template.
2. **Implement:** flip status to `in-progress`, write code + tests.
3. **Verify:** set `shipped-pending-migration`, tick checkbox, add `**Implementation:**` line.
4. **Migrate:** move to `## Shipped`, append a one-liner to `CHANGELOG.md / Unreleased / Added` (or `Changed`).

---

## Open

### [FEAT-003] Production packaging and distribution
- [ ] **Priority:** low
- **Area:** build
- **File(s):** `package.json` (build config + scripts), CI release workflow (new)
- **Why:** `package:dir` / `package:mac` are intentionally dev-only (no DMG, no
  signing, no notarization, no Windows/Linux targets). README's packaging notes
  defer production distribution to a later phase; this ticket is the placeholder
  so the deferral stays visible in the cycle.
- **Approach:** when prioritised: electron-builder targets for DMG (signed +
  notarized), Windows NSIS/MSI, Linux AppImage; a tag-triggered release
  workflow; auto-update is a separate decision.
- **Library / dependency notes:** electron-builder 26 already in devDependencies
  covers all targets; signing identities/notarization credentials are
  infrastructure, not deps.
- **Acceptance criteria:** deliberately deferred — to be specified when the
  ticket is pulled into a phase. Do not start from this stub without re-scoping.
- **Test plan:** smoke-launch each packaged artifact per OS.
- **Out of scope (now):** everything — this is a tracked deferral, not ready work.
- **Status:** open

### [FEAT-006] Navigation guards, CSP, and self-hosted fonts
- [ ] **Priority:** med
- **Area:** electron, build
- **File(s):** electron/main/main.cjs, electron/main/windowConfig.cjs, index.html, public/
- **Why:** NFR-1 requires the window to deny child windows and external navigation —
  no `setWindowOpenHandler` / `will-navigate` guard exists (SRS M9), and dev mode
  loads an env-controlled URL with the full agent-spawning API attached. Google Fonts
  are fetched at runtime — silent degradation offline, violating "no web server
  required" — and there is no CSP (T8).
- **Approach:** `setWindowOpenHandler(() => ({action: 'deny'}))`; `will-navigate`
  restricted to the dev origin and `file:`; self-host the two font families under
  `public/`; restrictive CSP meta tag in index.html.
- **Library / dependency notes:** fonts vendored as static assets; no deps.
- **Acceptance criteria:**
  - `window.open` and external navigation are denied; the Help-menu `openExternal`
    link still works.
  - Offline launch renders the correct fonts.
  - Built `dist/index.html` carries the CSP; VERIFICATION.md Stage 5.5 still passes.
- **Test plan:** pure-module tests for the guard policy (windowConfig pattern); manual
  offline launch.
- **Out of scope:** packaging/signing (FEAT-003).
- **Status:** open

### [FEAT-007] Toolchain currency: CI Node 22, `engines` pin, react deps out of the asar
- [ ] **Priority:** med
- **Area:** build
- **File(s):** .github/workflows/ci.yml, package.json, README.md
- **Why:** CI runs Node 20 (EOL April 2026) and nothing pins local Node — CI/local
  drift is unbounded (SRS T3). `react`/`react-dom` as prod deps are auto-packed into
  the asar although Vite already bundles them — dead-weight double-ship (T6).
- **Approach:** bump CI to Node 22; add an `engines` field; note the prerequisite in
  README; move react/react-dom to devDependencies or exclude `node_modules` from the
  electron-builder `files` list.
- **Library / dependency notes:** none.
- **Acceptance criteria:**
  - CI green on Node 22; `engines` warns on older local Node.
  - Packaged app contains no duplicate react copies and still launches (proven by
    FEAT-001's packaging step).
- **Test plan:** CI run; `package:dir` + smoke launch.
- **Out of scope:** dependency version upgrades beyond the Node baseline.
- **Status:** open

### [FEAT-009] `useWorkspace` test suite
- [ ] **Priority:** med
- **Area:** tests
- **File(s):** src/tests/useWorkspace.test.jsx (new), src/app/useWorkspace.js (api injection if needed)
- **Why:** the most intricate async code in the renderer has zero tests — would have
  caught R4 and R5 (SRS §6.5, WS3.2).
- **Approach:** inject `citybaseApi` (same pattern as `useApprovalRequests`); cover the
  load-token races, error paths, and menu wiring. Write against post-BUG-007 behavior.
- **Library / dependency notes:** none.
- **Acceptance criteria:**
  - Regression cases for R4/R5 are covered; suite green.
- **Test plan:** this ticket is the test plan.
- **Out of scope:** behavior changes (BUG-007 owns those).
- **Status:** open


### [FEAT-011] Vitest environment split, coverage, non-watch default
- [ ] **Priority:** med
- **Area:** tests, build
- **File(s):** vite.config.js, package.json, src/tests/
- **Why:** all tests — including Node-side Electron service tests — run under jsdom;
  the environment mismatch can mask Node-only bugs (SRS T9). No coverage tooling
  exists; bare `npm test` enters watch mode (NFR-4, WS3.4).
- **Approach:** node environment by default with jsdom per-glob for component tests;
  add `@vitest/coverage-v8` and a `test:coverage` script; make `npm test` a single
  pass (`vitest run`) with a `test:watch` alias.
- **Library / dependency notes:** `@vitest/coverage-v8` as a dev dep — verify the
  version compatible with Vitest 4 before installing.
- **Acceptance criteria:**
  - Full suite green under the split environments.
  - `npm test` is non-interactive; coverage report generates.
  - Command docs updated in the same PR (README, CLAUDE.md, VERIFICATION.md quote
    `npm test -- --run` today).
- **Test plan:** full suite + CI run.
- **Out of scope:** raising coverage thresholds.
- **Status:** open

### [FEAT-012] CI ergonomics: concurrency cancellation, macOS leg, OS-matrix decision
- [ ] **Priority:** low
- **Area:** build
- **File(s):** .github/workflows/ci.yml
- **Why:** superseded pushes run to completion (no concurrency group); once FEAT-001's
  smoke test lands, a macOS leg becomes meaningful (mac is the first ship target); the
  OS matrix is an open ROADMAP question (SRS WS3.5, Q3).
- **Approach:** add `concurrency` with cancel-in-progress; add a macOS job gated on
  FEAT-001; decide the matrix per open question Q3 at plan time.
- **Library / dependency notes:** none.
- **Acceptance criteria:**
  - Superseded runs are cancelled; macOS leg green.
- **Test plan:** observe CI behavior on a stacked push.
- **Out of scope:** release/deploy workflow (FEAT-003).
- **Status:** open

---

## v4.0 — "The Game" epic

Decision 2026-07-08 (see [docs/v4-game-engine.md](./docs/v4-game-engine.md)):
rebuild the presentation tier in Godot 4.7 on top of the extracted Node core.
Phase B's gate passed 2026-07-08 (**GO**) — Phases C–F ticketed below.

### [FEAT-024] v4 Phase C — the real 3D city
- [x] **Priority:** high
- **Area:** godot
- **File(s):** godot/ (scenes, scripts), docs/v4-game-engine.md
- **Why:** the epic centerpiece: replace the spike's block-clusters with the
  living city the original vision promised, driven by real snapshot data.
- **Approach:** district platforms with real architecture (building meshes
  weighted by file size/type, materials per district), lighting/bloom/day
  cycle, camera system (orbit + smooth fly-to-activity), the agent avatar —
  a visible presence that paths to the building each live tool-use event
  touches (spike's glow becomes arrival + work animation), dirty-file glow
  parity with the Electron city (staged green / unstaged amber), and a
  reduced-motion setting. Keep the spike's autotest screenshot mode working
  as the visual regression harness.
- **Library / dependency notes:** Godot 4.7 built-ins only; no addons
  expected. Any asset packs must be license-checked before vendoring.
- **Acceptance criteria:**
  - A real repo renders with per-district architecture and legible labels at
    1480×960; 60 fps with this repo loaded.
  - A live run walks the avatar to each touched building within ~1s of the
    event; completion plays a resolve animation.
  - Dirty files are visually distinct (staged/unstaged) from the snapshot.
  - Autotest mode still self-screenshots and quits for CI-style verification.
- **Test plan:** autotest screenshots per gate item; core-side behavior is
  already covered by the Vitest suite.
- **Out of scope:** workbench panels (FEAT-025), quests/XP (FEAT-026),
  packaging (FEAT-027).
- **Implementation:** godot/ split into `city_builder.gd` (districts on
  non-overlapping concentric rings; buildings typed by extension — code
  towers with roof lights, doc slabs, config cylinders — heights from real
  blob sizes via the new additive `snapshot.fileSizes`, `git ls-tree -r -l`;
  dirty parity: unstaged amber / staged green, refreshed on settle),
  `agent_avatar.gd` (glowing drone + ground-to-sky beam that flies to each
  touched building; green/red completion ripple on the BUG-031 settle
  event), `camera_rig.gd` (drag orbit + wheel zoom + fly-to-activity that
  yields to user input), and a slimmed `main.gd` (day-cycle sun, ambient,
  occlusion-tolerant screenshot autotest). Verified with a real claude run:
  beam lands on README within ~1s of the tool-use event, camera flies in,
  ripple resolves; 60fps vsync / 145fps uncapped with this repo loaded;
  reduced-motion env respected. Staged-green rendering is code-paritied but
  not screenshot-verified (no staged files at capture time).
- **Status:** shipped-pending-migration

### [FEAT-025] v4 Phase D — the workbench in-engine
- [ ] **Priority:** high
- **Area:** godot
- **File(s):** godot/
- **Why:** the Godot app must stand alone for daily work: dispatch, review,
  approve, commit — the whole demo sentence without the Electron shell.
- **Approach:** quest board fed from `features.md`/`bugs.md` (parsed by the
  core into a `quests.list` RPC) + run history; run detail with Outcome /
  Changed Districts / live activity (port `reviewModel` semantics); the
  approval modal as a hard gate wired to `agent.approve`/`agent.reject`;
  commit + PR actions; workspace/git error surfaces (BUG-007 parity);
  folder chooser via Godot `FileDialog` → `workspace.registerPath`.
- **Library / dependency notes:** none beyond Godot Control nodes.
- **Acceptance criteria:** the demoable v1 sentence executes end-to-end in
  the Godot app alone, including reject-path and error states.
- **Test plan:** extend the autotest to drive one gated run headlessly;
  manual walkthrough per VERIFICATION Stage 3 equivalents.
- **Out of scope:** ambient/living layer (FEAT-026).
- **Status:** open

### [FEAT-026] v4 Phase E — the living layer
- [ ] **Priority:** med
- **Area:** godot, core
- **File(s):** godot/, core/ (vitals + activity RPCs)
- **Why:** "no deliberate cuts" — every ambient system from the founding
  prototype returns as a real one.
- **Approach:** live activity feed (run events + `git log` + branch
  switches); real vitals (checks results, test counts, lint status, commit
  cadence); XP/levels derived from persisted run history; ambient city life
  (idle citizens, traffic along recently-committed paths, day/night).
- **Acceptance criteria:** every number on screen traces to a real source;
  the fiction→real mapping table in docs/v4-game-engine.md is fully checked.
- **Test plan:** core RPC unit tests; autotest screenshots.
- **Out of scope:** multiplayer/team anything.
- **Status:** open

### [FEAT-027] v4 Phase F — parity gate + cutover packaging
- [ ] **Priority:** med
- **Area:** build, godot, docs
- **File(s):** VERIFICATION.md (v4 stages), godot/export_presets.cfg, docs/
- **Why:** the Electron shell retires only when the Godot app passes the
  same gate the v1 shell did.
- **Approach:** a v4 parity checklist mirroring the v1 ship gate run against
  the Godot app; bundle a Node runtime (or pkg'd binary) for citybase-core
  in the export; Windows export verified (the Phase B leftover); signed
  macOS build folded in from FEAT-003's successor; `--legacy-shell` kept one
  release.
- **Acceptance criteria:** parity checklist green on macOS + Windows;
  a single distributable artifact boots city + core with no dev tooling.
- **Test plan:** the checklist is the test; packaged-app autotest run.
- **Out of scope:** auto-update.
- **Status:** open



---

## v2.0 — "The Living City" epic

The v1 wave shipped a solid but plain agent-dispatch shell and **deleted** the
entire repository-as-city visualization (map/cityModel/hex/kanban/analysis are
gone from `src`). v2.0 makes the founding promise real: the repo rendered as a
living isometric city, fused with real agent runs, on top of v1's real-data
foundation. This is the major-version content. Sequenced FEAT-013 → FEAT-019.

### [FEAT-017] Design system 2.0 — depth, motion, ambient
- [ ] **Priority:** med
- **Area:** renderer
- **File(s):** src/game/palette.js, src/game/theme.jsx, src/index.css
- **Why:** the current system is flat and sparse. v2.0 needs elevation, motion,
  and an ambient backdrop to feel cohesive and alive.
- **Approach:** extend tokens (elevation/shadow scale, spacing scale, motion
  durations, glow helpers); add reusable keyframes (pulse/scan/float) in index.css;
  an ambient gradient/grid backdrop behind the city; refine primitives. Additive —
  no breaking changes to existing components.
- **Acceptance criteria:** existing screens unbroken; new tokens used by the city;
  motion respects `prefers-reduced-motion`.
- **Test plan:** visual via dev-capture; existing suite green.
- **Out of scope:** a full component-library rewrite.
- **Status:** open

---

## v3.0 — "Real-Time City" epic

v2.0 made the city alive but runs are **buffered**: dispatch blocks ~10s, events
appear all-at-once on completion, the city only refreshes on a 2.5s poll, and run
history is lost on restart. v3.0 makes the workbench **real-time and durable** —
streaming non-blocking dispatch, live token/line events, the city animating as the
agent works, real cancel, and persistent runs. Functional core is the existing
backlog: **FEAT-004** (streaming runner), **FEAT-005** (real streaming events incl.
codex), **FEAT-008** (run persistence). New visual + release tickets below.


---

## Shipped

### [FEAT-005] Real CLI integration: correct `claude` / `codex` argv + event normalization
- [x] **Priority:** high
- **Area:** agents
- **File(s):** electron/main/agents/ClaudeAdapter.cjs, electron/main/agents/CodexAdapter.cjs, electron/main/agents/CliAgentAdapter.cjs, src/tests/ClaudeAdapter.test.js, src/tests/CodexAdapter.test.js
- **Why:** the current argv shapes match neither real CLI — `claude` wants
  `--print --output-format stream-json`, `codex` wants the `exec` subcommand — so
  every real run exits non-zero (SRS M18, acknowledged in-code). Ship gate FR-V6/FR-V7
  cannot be met without it.
- **Approach:** resolve open question Q1 (drive the installed CLIs vs the Claude Agent
  SDK) against current CLI docs at plan time — SRS §8 recommends deciding when the
  streaming runner lands, since event normalization depends on the chosen output
  format. Then implement per-adapter argv builders and normalize the real stream into
  `AgentEvent`s.
- **Library / dependency notes:** driving installed CLIs adds no runtime deps (AGENTS.md
  rule); the Agent SDK alternative would add one and needs PR justification. Verify
  current CLI flags against vendor docs before implementing — do not trust memory.
- **Acceptance criteria:**
  - With `claude` installed, a read-only run streams real events and completes.
  - `codex` equivalent works where installed (not a hard ship gate per ROADMAP).
  - Missing binary / auth needed / timeout surface as contract failure events.
- **Test plan:** unit tests against recorded stream fixtures per CLI; manual
  VERIFICATION.md Stage 3.6 walkthrough.
- **Out of scope:** approval flow (BUG-004), runner internals (FEAT-004).
- **Implementation:** ClaudeAdapter switched to `--output-format stream-json --verbose`; NDJSON parsed incrementally into live AgentEvents (assistant text + tool-use `file_path`), drained live by streamEvents; codex keeps its trail. Verified with the real CLI (claude-e2e 13/13, gui shows live events while RUNNING). The streamed touched paths light the exact city buildings.
- **Status:** shipped-pending-migration

### [FEAT-001] Desktop-mode E2E smoke test that opens the app window
- [x] **Priority:** high
- **Area:** tests
- **File(s):** `e2e/desktop.smoke.spec.js` (new), `package.json`, `.github/workflows/ci.yml`
- **Why:** ROADMAP Phase 1 work item "Add a 'desktop mode' smoke test that opens
  the app window" was never landed. The v1 ship gate requires "Build, lint,
  typecheck, and smoke tests are green", and today the Electron launch path
  (`main.cjs` → preload → renderer) has zero automated coverage — all 313 Vitest
  cases run in jsdom and never boot a real BrowserWindow. A regression in
  `main.cjs` wiring would ship green. SRS §6.4 confirms this is exactly where the
  two highest-impact integration bugs (M2, M3 → BUG-001, BUG-002) hid undetected
  (T4, WS3.1); SRS §8: this test lands **first**, not last — bundle it with
  BUG-001 + BUG-002 as the opening slice ("make the desktop shell real and
  provable").
- **Approach:** Add a minimal E2E layer that launches the packaged-dev app
  (`electron . ` against a built `dist/`) and asserts: window opens with title
  "Citybase", `window.citybase` is defined, `window.citybase.app.getVersion()`
  resolves (proves the bridge survives `sandbox: true` — the BUG-001 guard),
  `window.require`/`window.process` are undefined (isolation), and the city view
  root renders. Wire as a separate npm script (`test:e2e`) and an opt-in CI job
  (xvfb on ubuntu-latest), plus an `npx electron-builder --dir` packaging step in
  CI so a broken main entry, preload path, or `files` glob can't ship green (T4).
- **Library / dependency notes:** Playwright's `_electron` launcher is the
  current standard for Electron E2E (WebdriverIO's Electron service is the
  alternative; Spectron is dead). Recommendation: `@playwright/test` as a dev
  dependency — dev deps for testing are explicitly allowed by AGENTS.md.
  Verify latest stable version and Electron-support status before installing.
- **Acceptance criteria:**
  - `npm run test:e2e` builds nothing implicitly; it requires `dist/` and fails with a clear message if absent.
  - The spec launches Electron, waits for the window, and passes the five assertions above.
  - CI runs the E2E job on PRs (xvfb or headless equivalent) without flaking, and
    runs `npx electron-builder --dir` as a packaging step.
  - VERIFICATION.md Stage 2/3 steps referencing FEAT-001 are replaced with the real commands.
- **Test plan:** the feature *is* a test; additionally one negative assertion
  (isolation probe) so the suite guards the Stage 5 renderer-isolation constraint.
- **Out of scope:** E2E against the packaged app bundle (the CI packaging step only
  proves `electron-builder --dir` succeeds), multi-window flows, agent-run E2E
  against real CLIs, visual regression.
- **Implementation:** `e2e/desktop.smoke.spec.js` (Playwright 1.60 `_electron`,
  serial worker, CI-only `--no-sandbox`) asserting title, live bridge,
  `getVersion()` over real IPC, sandboxed renderer, rendered `#root`, and detect
  shape; `playwright.config.js`; `test:e2e` script with a clear dist-missing
  error; Vitest `exclude: e2e/**`; `desktop-smoke` CI job (xvfb + pinned SHAs +
  `electron-builder --dir`); VERIFICATION.md Stage 2.4 placeholder replaced;
  `index.html` title aligned to "Citybase". Captured the pre-wave bridge failure
  live before any fix existed.
- **Status:** shipped-pending-migration

### [FEAT-002] README safety model and troubleshooting sections
- [x] **Priority:** med
- **Area:** docs
- **File(s):** `README.md`
- **Why:** the v1 ship gate (ROADMAP) requires "README includes setup, app
  architecture, safety model, and troubleshooting". Setup and architecture
  exist; a user-facing safety-model section (approval boundaries, what agents
  may and may not do, renderer isolation) and a troubleshooting section
  (missing git, missing agent binaries, port 5173 busy, Windows Developer Mode
  for packaging) do not.
- **Approach:** add two sections to README.md: "Safety model" (summarise the
  approval boundary from ROADMAP + the isolation guarantees from main.cjs/
  preload.cjs in user terms) and "Troubleshooting" (the four failure modes
  above, each with symptom → cause → fix).
- **Library / dependency notes:** none.
- **Acceptance criteria:**
  - README gains both sections; every claim in them is traceable to code or ROADMAP.
  - No duplication drift: safety section links to docs/agent-runtime.md rather than restating the contract.
- **Test plan:** n/a (docs); VERIFICATION.md Stage 1 doc-drift check covers it.
- **Out of scope:** restructuring the rest of README; marketing copy.
- **Implementation:** shipped upstream in the v1 operator-guide rewrite
  (a6a31bd) — README gained "Safety model" (isolation flags, allow-listed IPC,
  single spawn site, git-mutation validation, the bypassPermissions caveat) and
  a symptom/cause/fix "Troubleshooting" table. Verified present at merge time;
  the agent-runtime.md cross-link this ticket wanted is folded into BUG-019's
  doc pass.
- **Status:** shipped-pending-migration

### [FEAT-013] City projection model
- [x] **Priority:** high
- **Area:** renderer
- **File(s):** src/app/cityModel.js (new), src/game/hex.js (new), src/tests/cityModel.test.js (new)
- **Why:** the city renderer needs a pure projection from the live git snapshot
  (`repoTree` tracked paths + `files` dirty entries) to districts/buildings.
  Ports the deleted projection from history `1356437` and improves it.
- **Approach:** `projectRepoTreeToCityModel(repoTree, files)` → `{ districts, buildings }`.
  Top-level folders → districts on concentric hex rings (busiest innermost);
  root files → synthetic `core`; buildings carry path/type/dirty/status; district
  carries file count + dirty count + health. Deterministic ordering. Pointy-top
  hex math in `hex.js`.
- **Acceptance criteria:** pure + deterministic; empty/edge inputs safe; dirty
  files flagged on buildings and counted per district; unit tested incl. a
  unicode/quoted-path fixture (guards BUG-009 at the model boundary).
- **Test plan:** `src/tests/cityModel.test.js` — projection shape, ordering,
  dirty propagation, ring overflow, empty tree.
- **Out of scope:** rendering (FEAT-014), agent overlay (FEAT-016).
- **Implementation:** `cityModel.js`/`hex.js`/`iso.js` projection + 17 unit tests.
- **Status:** shipped-pending-migration

### [FEAT-014] Isometric City renderer
- [x] **Priority:** high
- **Area:** renderer
- **File(s):** src/views/CityView.jsx (new), src/game/iso.js (new), src/tests/CityView.test.jsx (new)
- **Why:** the signature visual. A polished 2.5D isometric city is the
  centerpiece that makes Citybase a "2.0", not a form app.
- **Approach:** SVG isometric projection; each district is a raised platform
  carrying extruded building blocks (towers taller), neon-lit by district color,
  y-sorted for correct depth; dirty files glow (staged green / unstaged amber);
  district labels + health. **Fix BUG-008**: districts spaced so footprints never
  overlap and no building lands on a center/label tile (shared spacing constant
  between model seats and renderer cluster radius). Pan/zoom, hover tooltips,
  building selection.
- **Acceptance criteria:** renders a real repo with no overlapping districts;
  dirty files visibly distinct; legible at 1480×960; selecting a building surfaces
  its path/status; no console errors.
- **Test plan:** `src/tests/CityView.test.jsx` — renders from a fixture snapshot,
  building count matches model, dirty class applied, empty-tree empty state.
- **Out of scope:** live agent avatars (FEAT-016).
- **Implementation:** `CityView.jsx` isometric renderer + slabs/grid/lighting + tests.
- **Status:** shipped-pending-migration

### [FEAT-015] App shell navigation + canvas fill
- [x] **Priority:** high
- **Area:** renderer
- **File(s):** src/App.jsx, src/views/TopBar.jsx, src/game/theme.jsx
- **Why:** v1 wastes most of the window and has no way to reach the city. Need a
  primary City ↔ Work navigation and a layout that fills the canvas.
- **Approach:** a `view` state (`city` | `work`) with a segmented nav in the top
  bar; City is default when a workspace is open; Work hosts the existing
  run/commit/detail flow. Make main fill height; refine empty states.
- **Acceptance criteria:** toggling nav switches views with workspace state
  preserved; City is the default landing for an open workspace; no dead canvas;
  existing run/commit flow intact and tested.
- **Test plan:** App-level tests for nav switching + default view; existing suite
  stays green.
- **Out of scope:** command palette (later).
- **Implementation:** City/Work SegNav in TopBar; city is the default open-workspace view.
- **Status:** shipped-pending-migration

### [FEAT-016] Living agent runs in the city
- [x] **Priority:** high
- **Area:** renderer, agents
- **File(s):** src/views/CityView.jsx, src/app/useRunEvents.js, src/app/runCity.js (new)
- **Why:** the differentiator — watch an agent work in your city. Fuses the
  visual upgrade with the real run stream.
- **Approach:** while a run is active, derive touched paths from the run's
  `changed-area`/diff events (`useRunEvents`) and light up the corresponding
  buildings/districts; show a run "spark"/avatar and a pulse on completion;
  status color reflects running/done/failed. Pure mapping in `runCity.js`.
- **Acceptance criteria:** dispatching a run animates the affected city areas;
  completion/failure visibly resolves; no-op cleanly when the city view isn't open.
- **Test plan:** unit-test the event→city mapping; component test that active-run
  props apply activity classes.
- **Out of scope:** changing the agent protocol.
- **Implementation:** `runCity.js` + active-run overlay/banner + live snapshot refresh.
- **Status:** shipped-pending-migration

### [FEAT-018] Version 2.0 cut + docs
- [x] **Priority:** med
- **Area:** docs, build
- **File(s):** package.json, src/views/TopBar.jsx, README.md, ROADMAP.md, CHANGELOG.md, VERIFICATION.md
- **Why:** the version bump and the docs that describe the living city are part of
  shipping a 2.0.
- **Approach:** bump version to 2.0.0 and the TopBar label; README/ROADMAP describe
  the city + living runs as v2; CHANGELOG `2.0.0` release section; VERIFICATION
  gains City stages + refreshed baselines (done via /protocol-v-and-v on green).
- **Acceptance criteria:** version consistent across package.json + UI; docs match
  the shipped app; release notes accurate.
- **Test plan:** version assertion; doc-drift check (VERIFICATION Stage 1).
- **Out of scope:** production packaging (FEAT-003).
- **Implementation:** package.json 2.0.0, TopBar v2.0 label, CHANGELOG/README/ROADMAP.
- **Status:** shipped-pending-migration

### [FEAT-004] Streaming process runner
- [x] **Priority:** high
- **Status note:** in-progress (v3.0) — `processService.spawnStream`.
- **Area:** electron
- **File(s):** electron/main/services/processService.cjs, src/tests/processService.test.js (new)
- **Why:** buffered `execFile` with 15 s / 4 MB defaults structurally cannot host agent
  sessions (SRS M4); cancel needs a live handle (M7); orphaned `npm` grandchildren and
  silent truncation (M15). Unlocks the whole agent-harness arc (SRS WS0.3 — rated L,
  split from adapter adoption which is BUG-003).
- **Approach:** spawn-based API returning a handle (`{pid, onStdout, kill, done}`) with
  line-buffered NDJSON parsing, configurable/disabled timeout, SIGTERM→SIGKILL
  escalation, and process-group kill for `npm`. Existing `processService.run` callers
  (git, checks) keep working — either unchanged or reimplemented atop the new core.
- **Library / dependency notes:** Node built-in `child_process.spawn`; no new deps.
- **Acceptance criteria:**
  - A long-running fake CLI is killable within seconds, including its process tree.
  - NDJSON lines surface incrementally via the handle, not after exit.
  - Timeout is configurable per call and can be disabled for agent runs.
  - All existing git/checks call sites stay green.
- **Test plan:** direct unit tests with fake scripts: streaming, kill escalation,
  timeout, output truncation; full existing suite stays green.
- **Out of scope:** adapter adoption (BUG-003), Windows `.cmd` strategy (BUG-006),
  real CLI argv (FEAT-005).
- **Implementation:** `processService.spawnStream` (non-blocking, line-streamed, killable) adopted by the adapters for non-blocking dispatch + real cancel; tested + harness-verified (running→done).
- **Status:** shipped-pending-migration

### [FEAT-008] Persist run history beside workspaces.json
- [x] **Priority:** med
- **Area:** agents, electron
- **File(s):** electron/main/agents/agentManager.cjs, electron/main/services/ (new run store), src/tests/
- **Why:** ROADMAP Phase 3 work item "Store runs locally with timestamps, provider,
  prompt, and final result" — today runs are in-memory only and lost on restart (SRS
  FR-A2, WS2.6). Doubles as the eviction store BUG-014 needs.
- **Approach:** persist runs in Electron `userData` next to `workspaces.json`,
  injected-fs pattern like `workspaceService`; load history on boot. Open question Q2:
  per-workspace `runs.json` keyed by workspace id (SRS assumption) or global — confirm
  at plan time.
- **Library / dependency notes:** none (JSON file).
- **Acceptance criteria:**
  - A completed run survives app restart and is listed in history.
  - Registry eviction (BUG-014) wired to the store.
- **Test plan:** unit tests for the store with injected fs; agentManager integration
  test.
- **Out of scope:** run-review UI changes.
- **Implementation:** `runStore` (atomic writes, terminal-only, capped) + manager seed/persist + graceful historical handling + ipc wiring; verified a real run persists to runs.json and seeds on next launch.
- **Status:** shipped-pending-migration

### [FEAT-019] Live real-time city animation
- [x] **Priority:** high
- **Area:** renderer
- **File(s):** src/views/CityView.jsx, src/app/runCity.js
- **Why:** with streaming (FEAT-004) the city can react to each touched file the
  instant it changes, not on a 2.5s poll. A visible live agent presence is the v3
  "wow".
- **Approach:** derive touched paths from the live event stream as they arrive;
  pulse/illuminate those buildings immediately; show a glowing "agent at work"
  presence and a completion ripple; smooth camera ease (optional focus on the
  active district). Respect `prefers-reduced-motion`.
- **Acceptance criteria:** during a streamed run, buildings light within ~1s of
  the edit; completion visibly resolves; no-op cleanly when idle/reduced-motion.
- **Test plan:** unit-test the event→touched-paths mapping; component test that
  live touched paths apply the active class.
- **Out of scope:** the streaming runner itself (FEAT-004).
- **Implementation:** Live agent presence (scanning marker over the worked area) + completion ripple in CityView, reduced-motion respected; captured live during a real run.
- **Status:** shipped-pending-migration

### [FEAT-021] Version 3.0 cut + docs
- [x] **Priority:** med
- **Area:** docs, build
- **File(s):** package.json, src/views/TopBar.jsx, README.md, ROADMAP.md, CHANGELOG.md, VERIFICATION.md
- **Why:** the version bump and docs that describe the real-time workbench are part
  of shipping v3.
- **Approach:** bump to 3.0.0 + TopBar label; README/ROADMAP describe streaming +
  persistence; CHANGELOG 3.0.0 section; VERIFICATION baseline refreshed via V&V.
- **Acceptance criteria:** version consistent across manifest + UI; docs match the
  shipped app.
- **Test plan:** version assertion; doc-drift check.
- **Out of scope:** production packaging (FEAT-003).
- **Implementation:** package.json 3.0.0, TopBar v3.0 label, CHANGELOG 3.0.0 section, README/ROADMAP real-time framing.
- **Status:** shipped-pending-migration

### [FEAT-020] Streaming run detail
- [x] **Priority:** high
- **Area:** renderer
- **File(s):** src/views/RunDetail.jsx
- **Why:** events should append live with progress, not appear all at once when
  the run finishes.
- **Approach:** render the live `useRunEvents` stream incrementally; a context/
  progress bar from `reportUsage`; a live "running…" indicator; auto-scroll.
- **Acceptance criteria:** events appear as they stream; terminal state loads the
  diff/checks; backstop (`getEvents`) still covers re-mounts.
- **Test plan:** component test with an incremental event stream.
- **Out of scope:** changing the event protocol.
- **Implementation:** running runs render a "Live Activity" panel — the
  `useRunEvents` stream appends incrementally, the container follows the tail
  (auto-scroll), and a pulsing "agent working" indicator (reduced-motion-safe)
  makes in-flight state unambiguous. Terminal state swaps to the Phase 4
  review surface and loads diff/checks; `getEvents` remains the re-mount
  backstop. The `reportUsage` progress bar was skipped — the adapter's
  `reportUsage` is still a placeholder envelope, so there is nothing real to
  render. Covered by `src/tests/RunDetail.test.jsx` (incremental stream case).
- **Status:** shipped-pending-migration

### [FEAT-022] Extract `citybase-core`: headless daemon + WS JSON-RPC facade
- [x] **Priority:** high
- **Area:** electron, agents, ipc
- **File(s):** core/ (new), electron/main/ipc.cjs, electron/main/ipcHandlers.cjs, src/tests/
- **Why:** v4 Phase A. The Godot frontend needs the agent harness behind a
  transport it can speak (localhost WebSocket); the Electron shell should
  become a thin client of the same handler map so both frontends share one
  brain and one security boundary.
- **Approach:** new `core/server.cjs` that instantiates the existing services
  (same injected-deps factories) and exposes `createIpcHandlers`' channel map
  as JSON-RPC over a `127.0.0.1` WebSocket; `{event: 'agent-event'}` push
  notifications reuse the `pumpAgentEvents` envelope; session token minted at
  startup and required on connect; `workspace.pick` becomes a
  register-validated-path method (native dialog moves frontend-side).
  Electron keeps its in-proc path this ticket — dual-hosting is proven by a
  protocol conformance test, not by rewiring the shell yet.
- **Library / dependency notes:** needs a WS server dep (`ws` is the de facto
  standard) — verify latest stable + advisory status before install, per
  AGENTS.md new-dep rule.
- **Acceptance criteria:**
  - `node core/server.cjs --workspace <path>` serves the full channel map;
    a scripted client can pick/validate a workspace, get a snapshot, dispatch
    a gated run, approve it, and stream its events to completion.
  - Rejects connections without the session token; binds loopback only.
  - Protocol conformance test asserts the WS method set === the preload
    surface (FEAT-010's manifest idea, upgraded).
  - Entire existing suite stays green; Electron app behavior unchanged.
- **Test plan:** unit tests for the server glue (injected fake services);
  integration test driving a real core instance over WS against a fixture
  repo; conformance test.
- **Out of scope:** Godot anything (FEAT-023); retiring Electron IPC.
- **Implementation:** `workspaceService` split into the pure
  `workspaceServiceCore.cjs` factory (injected userData dir / dialog / fs;
  new `registerWorkspacePath` primitive) with the Electron singleton as thin
  glue — every importer unchanged. New `core/rpcServer.cjs` (pure: token-gated
  loopback WS, JSON-RPC dispatch onto the `citybase:*` handler map,
  agent-event broadcast, boot push), `core/userData.cjs`, and the
  `core/server.cjs` daemon entry (`npm run core`; env: TOKEN/PORT/USERDATA,
  `--print-conn` for scripted clients) wiring the real services exactly like
  `ipc.cjs`. `workspace.registerPath` added to the shared handler map.
  Conformance test guards preload ⇄ handler-map parity (headless-only
  whitelist). `ws@8.21` added (justified: the core's transport). Verified
  live: daemon booted with real services; a scripted WS client registered
  this repo, pulled a real snapshot (118 files, correct branch), detected the
  real claude CLI, got the correct headless `pick` error, and received the
  boot push. 432 tests + desktop E2E green (Electron shell unchanged).
- **Status:** shipped-pending-migration

### [FEAT-023] Godot 4.7 spike — go/no-go gate for the engine frontend
- [x] **Priority:** high
- **Area:** build, renderer
- **File(s):** godot/ (new project dir), docs/v4-game-engine.md (gate results)
- **Why:** v4 Phase B. Proves the engine can carry the product before any
  city/workbench investment: WS client to the core, JSON throughput, 3D
  render from a real snapshot, live event-driven animation, text UI
  viability, mac export.
- **Approach:** minimal Godot 4.7 project (GDScript): spawn `citybase-core`
  via `OS.create_process` (env-passed token), connect `WebSocketPeer`,
  render each district of a real repo snapshot as a lit 3D block cluster,
  dispatch one read-only run and glow the touched building within 1s of the
  streamed event, plus one `RichTextLabel` panel rendering a run's event
  trail. Export a signed-nothing `.app` and run it outside the editor.
  Time-box: if the gate can't pass, record why in docs/v4-game-engine.md and
  fall back to the WebGL-in-Electron path with Phase A already banked.
- **Library / dependency notes:** Godot 4.7 stable (editor + export
  templates) as a dev-machine prerequisite, not an npm dep; no addons for
  the spike — the sidecar removes the need for process/pipe addons.
- **Acceptance criteria:**
  - Spike app on macOS: boots core, authenticates, renders the real city
    blocks, streams a live run into a building glow, event panel readable.
  - Frame rate ≥ 60fps with the citybase repo's own tree loaded.
  - Export runs outside the editor on macOS (Windows export attempted,
    result recorded).
  - Go/no-go verdict + measurements appended to docs/v4-game-engine.md.
- **Test plan:** the gate checklist is the test; core-side interactions
  covered by FEAT-022's integration test.
- **Out of scope:** full city visuals (Phase C), workbench panels (Phase D),
  packaging polish (Phase F).
- **Implementation:** `godot/` project (Godot 4.7 stable, GDScript): spawns
  `core/server.cjs` with an env-passed session token, connects
  `WebSocketPeer` with retry-until-boot, renders the real snapshot as lit 3D
  district platforms + extruded buildings under a bloom environment, streams
  the live event trail into a `RichTextLabel`, and glows the exact building
  a claude tool-use touches (verified with a real read-only run: the
  `Read README.md` event lit the README building within ~1s). 60 fps after
  warmup. Packaged `--export-release macOS` app ran the full flow with no
  editor. Self-screenshotting autotest mode (`CITYBASE_SPIKE_OUT`) makes the
  gate re-runnable. Gate results + gotchas (float JSON ids, ETC2/ASTC for
  arm64, `CITYBASE_REPO_ROOT` for exported builds) recorded in
  docs/v4-game-engine.md. **Verdict: GO.**
- **Status:** shipped-pending-migration

### [FEAT-010] Bridge contract parity test
- [x] **Priority:** med
- **Area:** tests
- **File(s):** src/tests/bridgeContract.test.js (new), shared manifest module
- **Why:** the renderer↔preload contract is tested against a hand-written mock, so
  drift between preload, the browser stub, and the tests is invisible (SRS §6.5,
  WS3.3).
- **Approach:** one shared manifest of `namespace.method` names asserted against both
  the preload surface and the browser stub; the deliberate stub divergences (SRS R22)
  whitelisted explicitly.
- **Library / dependency notes:** none.
- **Acceptance criteria:**
  - Removing or renaming a preload method fails the test; stub parity enforced.
- **Test plan:** this ticket is the test plan.
- **Out of scope:** E2E (FEAT-001).
- **Implementation:** realized by FEAT-022's `src/tests/coreProtocol.test.js`:
  the preload's invoked channels and `createIpcHandlers`' map are asserted
  against each other in both directions with an explicit headless-only
  whitelist. The browser stub this ticket wanted to include was deleted with
  the browser path, so preload ⇄ handlers is the whole contract.
- **Status:** shipped-pending-migration
