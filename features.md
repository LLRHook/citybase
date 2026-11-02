# Citybase — Feature Tracker

Active work only. Format and rules: [`.cycle/TRACKERS.md`](.cycle/TRACKERS.md). Write with `python .cycle/trackers.py`, never by hand. Shipped and closed entries are removed; their record is `CHANGELOG.md`, Jira, and `python .cycle/trackers.py show <id>`.

## Open

### [FEAT-1793649547] Publish the current foundation requirements and contracts
- [x] **Priority:** high
- **Area:** docs
- **File(s):** docs/README.md, docs/SRS.md, docs/DATA_CONTRACTS.md, docs/ARCHITECTURE.md, docs/OPERATIONS.md, docs/FOUNDATION.md
- **Req:** Owner request 2026-11-02: proper foundation and all docs; v4 charter and existing requirements baseline
- **Depends on:** none
- **UI:** none (documentation)
- **Why:** The only SRS is a dated prototype review; current service boundaries, transport and persistence contracts and release gates lack one coherent home.
- **Approach:** Add a current documentation index, traceable requirements, as-built architecture, wire/storage contracts and operations/release procedure. Preserve historical source text and distinguish implemented, verified and pending gates.
- **Library / dependency notes:** none
- **Acceptance criteria:**
  - Each current core capability has source/evidence, verification and an honest delivery state.
  - Contract fields, RPC methods, limits and failure modes match code.
  - Setup, CI, backup, verification, packaging and release instructions use real commands.
  - Local Markdown links and requirement IDs validate; historical sources are preserved.
- **Test plan:** Requirement index, local link check, direct code comparison and full local test matrix; record exact platform and SHA.
- **Out of scope:** New product behavior, cloud infrastructure, paid provider trials, new release tags or deployments.
- **Bump:** minor
- **Assignee:** Victor Ivanov
- **Status:** shipped-pending-migration
- **Implementation:** Current SRS with traceable acceptance, architecture, transport/storage contracts, operations and delivery report; requirement index and local-link checks pass.
- **Docs:** docs/README.md, docs/SRS.md, docs/ARCHITECTURE.md, docs/DATA_CONTRACTS.md, docs/OPERATIONS.md, docs/FOUNDATION.md

### [FEAT-003] Production packaging and distribution
- [ ] **Priority:** low
- **Area:** build
- **File(s):** `package.json` (build config + scripts), CI release workflow (new)
- **Req:** CB-FR-012, CB-CON-005
- **Depends on:** none documented in original finding
- **UI:** none (tooling/verification)
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
- **Out of scope:** (now) everything — this is a tracked deferral, not ready work.
- **Bump:** minor
- **Status:** open

### [FEAT-006] Navigation guards, CSP, and self-hosted fonts
- [ ] **Priority:** med
- **Area:** electron, build
- **File(s):** electron/main/main.cjs, electron/main/windowConfig.cjs, index.html, public/
- **Req:** CB-CON-001
- **Depends on:** none documented in original finding
- **UI:** existing Electron navigation and renderer
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
- **Bump:** minor
- **Status:** open

### [FEAT-007] Pin supported Node and avoid duplicate renderer packages
- [x] **Priority:** med
- **Area:** build
- **File(s):** .github/workflows/ci.yml, package.json, README.md
- **Req:** Owner foundation request; legacy SRS T3/T6; jsdom 30 engine requirements
- **Depends on:** none
- **UI:** none
- **Why:** CI runs Node 20 (EOL April 2026) and nothing pins local Node — CI/local
  drift is unbounded (SRS T3). `react`/`react-dom` as prod deps are auto-packed into
  the asar although Vite already bundles them — dead-weight double-ship (T6).
- **Approach:** Use Node 24.15.0+ in the 24.x line or Node 26.x. Pin engines and .nvmrc, use that pin in CI, move bundled React packages to development dependencies, and verify the unpacked Electron app.
- **Library / dependency notes:** none.
- **Acceptance criteria:**
  - Local gates and CI use the supported Node baseline; older runtimes produce an engine warning.
  - The packaged Electron app contains no duplicate React packages and still launches.
- **Test plan:** CI run; `package:dir` + smoke launch.
- **Out of scope:** dependency version upgrades beyond the Node baseline.
- **Bump:** minor
- **Assignee:** Victor Ivanov
- **Status:** shipped-pending-migration
- **Implementation:** Supported Node LTS range and .nvmrc drive CI; React is bundled-only. Windows unpacked smoke passes and app.asar contains zero React package entries.
- **Docs:** README.md, AGENTS.md, CONTRIBUTING.md, VERIFICATION.md, docs/OPERATIONS.md, docs/ARCHITECTURE.md

### [FEAT-009] `useWorkspace` test suite
- [ ] **Priority:** med
- **Area:** tests
- **File(s):** src/tests/useWorkspace.test.jsx (new), src/app/useWorkspace.js (api injection if needed)
- **Req:** CB-NFR-005
- **Depends on:** none documented in original finding
- **UI:** none (tooling/verification)
- **Why:** the most intricate async code in the renderer has zero tests — would have
  caught R4 and R5 (SRS §6.5, WS3.2).
- **Approach:** inject `citybaseApi` (same pattern as `useApprovalRequests`); cover the
  load-token races, error paths, and menu wiring. Write against post-BUG-007 behavior.
- **Library / dependency notes:** none.
- **Acceptance criteria:**
  - Regression cases for R4/R5 are covered; suite green.
- **Test plan:** this ticket is the test plan.
- **Out of scope:** behavior changes (BUG-007 owns those).
- **Bump:** minor
- **Status:** open

### [FEAT-011] Vitest environment split, coverage, non-watch default
- [x] **Priority:** med
- **Area:** tests, build
- **File(s):** vite.config.js, package.json, src/tests/
- **Req:** Owner foundation request; legacy SRS T9, NFR-4 and WS3.4
- **Depends on:** FEAT-007
- **UI:** none
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
- **Bump:** minor
- **Assignee:** Victor Ivanov
- **Status:** shipped-pending-migration
- **Implementation:** 30 Node test files and 10 jsdom renderer files run 477 cases; npm test is single-pass, explicit watch and V8 coverage commands work.
- **Docs:** README.md, AGENTS.md, CONTRIBUTING.md, VERIFICATION.md

### [FEAT-012] CI ergonomics: concurrency cancellation, macOS leg, OS-matrix decision
- [x] **Priority:** low
- **Area:** build
- **File(s):** .github/workflows/ci.yml
- **Req:** Owner foundation request; v4 charter macOS and Windows support; legacy SRS WS3.5
- **Depends on:** FEAT-007
- **UI:** none
- **Why:** superseded pushes run to completion (no concurrency group); once FEAT-001's
  smoke test lands, a macOS leg becomes meaningful (mac is the first ship target); the
  OS matrix is an open ROADMAP question (SRS WS3.5, Q3).
- **Approach:** Cancel superseded workflow runs and validate the shared runtime on Ubuntu, Windows and macOS. Keep stable ci and desktop-smoke job names; add a platform-smoke matrix for Windows/macOS.
- **Library / dependency notes:** none.
- **Acceptance criteria:**
  - Superseded runs are cancelled; macOS leg green.
- **Test plan:** observe CI behavior on a stacked push.
- **Out of scope:** release/deploy workflow (FEAT-003).
- **Bump:** minor
- **Assignee:** Victor Ivanov
- **Status:** shipped-pending-migration
- **Implementation:** CI run 41521776236 passed all five checks at eaf02cc: coverage/static, Linux desktop/package, Windows smoke, macOS smoke and checksum-pinned Linux Godot. Concurrency cancels superseded PR workflow runs; final stacked bookkeeping pushes exercise that gate.
- **Docs:** CONTRIBUTING.md, VERIFICATION.md, docs/FOUNDATION.md

### [FEAT-024] v4 Phase C — the real 3D city
- [x] **Priority:** high
- **Area:** godot
- **File(s):** godot/ (scenes, scripts), docs/v4-game-engine.md
- **Req:** CB-FR-002
- **Depends on:** FEAT-023
- **UI:** Godot city and camera
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
- **Bump:** minor
- **Status:** shipped-pending-migration
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

### [FEAT-025] v4 Phase D — the workbench in-engine
- [x] **Priority:** high
- **Area:** godot
- **File(s):** godot/
- **Req:** CB-FR-003, CB-FR-006, CB-FR-008
- **Depends on:** FEAT-024
- **UI:** Godot WORK and approval/outcome controls
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
- **Bump:** minor
- **Status:** shipped-pending-migration
- **Implementation:** new core `questService` (pure factory; parses
  features.md/bugs.md open entries) behind an optional `quests.list` channel
  (headless-whitelisted in the conformance test) + unit tests. New
  `godot/workbench.gd`: quest board fed by the real trackers (16 live
  items; selecting one drafts the prompt), run history, gated dispatch
  (`approvalMode: 'ask'` — BUG-004 parity), approval modal wired to
  agent.approve/reject, live activity stream, Outcome panel (changed
  districts + churn + checks + risk heuristic ported from reviewModel),
  commit action (`git.commit` addAll + snapshot reload), workspace error
  surface (BUG-007 parity) and FileDialog → workspace.registerPath.
  Autotest extended: `CITYBASE_AUTOTEST_DECISION=approve|reject` drives the
  gate headlessly — reject path verified free-of-spawn (modal → reject →
  cancelled, no CLI), approve path verified end-to-end with a real claude
  run (modal → approve → live events → settle → Outcome renders the real
  workspace diff + checks). Honest gaps: error surface implemented but not
  screenshot-verified against a live non-repo; outcome diff shows the
  workspace diff (v1 produceDiff semantics), not per-run isolation.

### [FEAT-026] v4 Phase E — the living layer
- [x] **Priority:** med
- **Area:** godot, core
- **File(s):** godot/, core/ (vitals + activity RPCs)
- **Req:** CB-FR-010
- **Depends on:** FEAT-025
- **UI:** Godot activity/vitals HUD
- **Why:** "no deliberate cuts" — every ambient system from the founding
  prototype returns as a real one.
- **Approach:** live activity feed (run events + `git log` + branch
  switches); real vitals (checks results, test counts, lint status, commit
  cadence); XP/levels derived from persisted run history; ambient city life
  (idle citizens, traffic along recently-committed paths, day/night).
- **Library / dependency notes:** Godot and the existing shared core; no additional npm runtime dependency.
- **Acceptance criteria:** every number on screen traces to a real source;
  the fiction→real mapping table in docs/v4-game-engine.md is fully checked.
- **Test plan:** core RPC unit tests; autotest screenshots.
- **Out of scope:** multiplayer/team anything.
- **Bump:** minor
- **Status:** shipped-pending-migration
- **Implementation:** `godot/living_layer.gd` — built entirely from EXISTING
  real surfaces (no new protocol): activity feed merges `recentCommits` +
  live run lifecycle events (deduped); vitals chips show commits/day
  (computed from real commit timestamps), tracked/dirty counts, run count +
  success rate, and XP/level derived from the persisted run history
  (done 25 · failed 5 · cancelled 2, level = √(xp/50)+1); ambient life =
  random building window-flicker + drifting motes between district centers
  (≤6 concurrent, tween-driven, skipped under reduced motion). Captured
  live: the feed listed this epic's own merge commits and vitals read
  LV 3 · 204 xp · 100% success · 10 runs. Deviation from the ticket noted:
  no new core vitals/activity RPCs were needed — client-side derivation
  from existing data was simpler and equally real.

### [FEAT-027] v4 Phase F — parity gate + cutover packaging
- [ ] **Priority:** med
- **Area:** build, godot, docs
- **File(s):** VERIFICATION.md (v4 stages), godot/export_presets.cfg, docs/
- **Req:** CB-FR-012, CB-CON-005
- **Depends on:** FEAT-026
- **UI:** native Godot launch and parity surfaces
- **Why:** the Electron shell retires only when the Godot app passes the
  same gate the v1 shell did.
- **Approach:** a v4 parity checklist mirroring the v1 ship gate run against
  the Godot app; bundle a Node runtime (or pkg'd binary) for citybase-core
  in the export; Windows export verified (the Phase B leftover); signed
  macOS build folded in from FEAT-003's successor; `--legacy-shell` kept one
  release.
- **Library / dependency notes:** Existing esbuild/ws plus native macOS Godot export templates, codesign and supported Node with --build-sea.
- **Acceptance criteria:** parity checklist green on macOS + Windows;
  a single distributable artifact boots city + core with no dev tooling.
- **Test plan:** the checklist is the test; packaged-app autotest run.
- **Out of scope:** auto-update.
- **Bump:** minor
- **Assignee:** Victor Ivanov
- **Status:** in-progress
- **Implementation:** `npm run package:v4` (scripts/package-v4.mjs): esbuild
  bundles the core to one CJS file; Node 25.5+'s one-step `--build-sea`
  injects it into a cached OFFICIAL node binary (Homebrew node has no SEA
  fuse); native ad-hoc codesign (arm64 chained fixups); Godot export; core
  embedded at Contents/Resources/citybase-core; app re-signed. main.gd
  prefers the bundled core and, packaged with no remembered workspace,
  prompts instead of auto-registering. Verified: the packaged app booted
  standalone — `core spawned (bundled)`, workspace restored, city + quest
  board live, autotest frames captured. macOS parity checklist recorded in
  docs/v4-game-engine.md; **Windows leg pending the Windows machine**
  (acceptance is therefore partially open — tracked in the gate table, not
  silently dropped). esbuild added as a devDependency (justified: the SEA
  bundling step).

### [FEAT-017] Design system 2.0 — depth, motion, ambient
- [ ] **Priority:** med
- **Area:** renderer
- **File(s):** src/game/palette.js, src/game/theme.jsx, src/index.css
- **Req:** CB-FR-002 (legacy design scope; reconfirm against the v4 charter)
- **Depends on:** none documented in original finding
- **UI:** legacy city design; requires v4 scope confirmation
- **Why:** the current system is flat and sparse. v2.0 needs elevation, motion,
  and an ambient backdrop to feel cohesive and alive.
- **Approach:** extend tokens (elevation/shadow scale, spacing scale, motion
  durations, glow helpers); add reusable keyframes (pulse/scan/float) in index.css;
  an ambient gradient/grid backdrop behind the city; refine primitives. Additive —
  no breaking changes to existing components.
- **Library / dependency notes:** Legacy visual scope; no dependency selected for new work pending v4 direction confirmation.
- **Acceptance criteria:** existing screens unbroken; new tokens used by the city;
  motion respects `prefers-reduced-motion`.
- **Test plan:** visual via dev-capture; existing suite green.
- **Out of scope:** a full component-library rewrite.
- **Bump:** minor
- **Status:** open
