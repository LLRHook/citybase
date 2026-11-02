# Foundation delivery and readiness

This record covers the November 2, 2026 foundation work. It is not a new product
release or a claim that every historical feature and native parity gate is done.

## Scope and PR disposition

- PRs #63, #64, #65, #70 and #71 are merged. Action pins and production patches
  are integrated with the Windows multi-instance and persistence fixes.
- PR #71's conflicting legacy bug IDs became BUG-043 through BUG-045; #70's
  BUG-032 through BUG-034 retain their distinct meanings. Its new Windows test
  fixture uses the actual native state-file path.
- PR #68's dependency upgrades are integrated into this foundation branch and
  validated with the supported Node baseline. Its original CI used Node 20 and
  ran no tests. Close #68 as superseded only after the combined foundation PR
  passes CI and merges; do not leave its changes unlanded.
- PR #69 is pending an explicit product-direction decision: its Electron-only
  model-shop proposal conflicts with the current Godot charter. Its branch and
  work remain preserved.
- The requested Claude driver was created in an isolated checkout, but its first
  run stopped at the provider's weekly API limit before making changes. The
  primary agent resumed the work; no replacement provider was silently delegated.

## Delivered foundation

FEAT-007 establishes supported Node LTS ranges, `.nvmrc`, matching CI and React
as development-only packages bundled by Vite. FEAT-011 separates real Node tests
from jsdom renderer tests, adds a non-watch default, explicit watch command and
V8 coverage. FEAT-012 adds obsolete-run cancellation, Windows/macOS smoke and a
checksum-pinned Linux Godot regression/transport job while retaining the existing
stable CI job names.

The maintained `.cycle/` writer, schema, merge driver and hooks are installed
with root trackers and Jira off. Historical completed copies were reconciled
against their pre-adoption sections, whose entire contents remain in
[history](history/README.md). Unfinished work and v4 pending-migration entries
remain active. Adoption is not evidence that an old defect is fixed.

BUG-1793649547 updates living documentation to match CLI adapters, hook-based
React state, Godot/Node ownership, profile limits and actual safety boundaries.
FEAT-1793649547 adds the current SRS, architecture, wire/storage contracts,
operations and a documentation index. Historical source requirements are retained.

## Evidence and practical limits

On Windows with Node 24.15.0 and checksum-verified Godot 4.7.2:

| Check | Observed result |
|---|---|
| Integrated Vitest suite | 477/477, 40 files, zero skips: Node 404/30 files, renderer 73/10 files |
| V8 coverage after dependency integration | 72.85% lines, 70.83% statements, 69.17% branches, 68.21% functions; no invented threshold |
| Lint / production renderer build | Pass |
| Real Electron smoke | Pass; host-inherited ELECTRON_RUN_AS_NODE is removed by the test launcher |
| Unpacked Windows Electron artifact | Explicit unsigned verification package launches; zero duplicate React package entries in app.asar |
| Godot regressions | 24 checks pass |
| Real Godot/WS transport | 13 checks pass, including oversized results, disconnect and explicit reconnect without replay |
| Fresh committed checkout | All automated layers pass at `ff9e1505d5e0`; same 477 cases, no skips, tracker lint and local Markdown links clean |
| Integrated dependency candidate | Fresh checkout at `1d5b431`: all automated layers and the Electron 43.3 unpacked artifact/smoke pass; zero duplicate React entries |
| Native Godot GUI | Actual source city, fixture selection, WORK, approval/reject, cancelled history and selected workspace restored after restart; fixture Git tree unchanged |

Raw logs and machine reports are kept in private verification evidence, and the
final local run records the tested commit in `.vv/last-run.md`. These observations
must be reconciled with the final committed checkout; current CI results belong
to that PR head. No fresh real-model generation trial or all-platform release
validation is implied.

The native walkthrough exposed a low-severity existing HUD claim: it displays
100% success with no successful/failed completed runs, including a cancelled-only
history. That finding is filed in `bugs.md`. Accessibility inspection exposed
only the engine window in the native control tree; no screen-reader compliance
claim follows from the visual/interaction checks.

## Release readiness

The development foundation has a reproducible automated gate and current docs.
A full product release remains **NO-GO** until the applicable native/manual
acceptance and remaining required capabilities are resolved:

- Final Windows Godot distribution/parity and a fresh native macOS candidate.
- Production packaging/signing/notarization/distribution (FEAT-003).
- Renderer navigation/CSP/fonts hardening (FEAT-006).
- Truthful Codex activity (BUG-003), durable progression (BUG-037), initial camera
  framing (BUG-042), and re-confirmation of older residual findings.
- Complete exact-SHA V&V, eligible tracker migration and an explicit version and
  publication decision. Partial automated results do not append a full Verified
  release pass or clear unrelated pending v4 items.

## Documentation impact

| Owner | Change |
|---|---|
| README / contributing / agent instructions | Current supported commands, frontend direction, test environments and cycle policy |
| Domain / agent runtime | Live entities, actual CLI interface, event fidelity and run-wide approval |
| SRS / architecture / contracts | Traceable current baseline, trust boundaries, storage and wire behavior |
| Operations / verification | Disposable profiles, backups, test matrix, native packaging and release gates |
| Roadmap / historical sources | Current sequencing and explicit distinction between dated evidence and present acceptance |
