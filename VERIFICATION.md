# Citybase verification and validation

This file owns repeatable procedure and the current test baseline. Run reports
belong in `.vv/last-run.md`; a full green result is recorded in `CHANGELOG.md`
with its exact tested SHA. Partial checks do not authorize a release.

The pre-foundation checklist and detailed historical recipes are preserved in
[history](docs/history/verification-2026-11-02.md). Current behavior and limits
are in [requirements](docs/SRS.md), [contracts](docs/DATA_CONTRACTS.md), and
[operations](docs/OPERATIONS.md).

## Stage 0: Fresh candidate and prerequisites

- Record branch, `git rev-parse HEAD`, clean/dirty state and prior Verified SHA.
  Use a fresh committed checkout for the final local gate; never discard another
  writer's changes. Install from `package-lock.json` with `npm ci`.
- Check `node --version`, `npm --version`, `git --version`, Godot 4.7.2, and
  `python --version`. `package.json` owns the supported Node ranges; `.nvmrc`
  selects the default 24 line. Real provider journeys require an authenticated
  CLI and available quota; the PR journey additionally requires `gh`.
- Run `python .cycle/trackers.py install`; confirm `git config core.hooksPath`
  is `hooks`. Use disposable state and Git fixtures, never reset a real profile.
- Rebuild `dist/`. For Godot, the test wrapper imports the project. Stop only
  processes started for this run; do not stop another instance or reuse its port.
- Save tool versions, candidate/artifact hashes, data setup and raw logs to `.vv/`.

### Verification data

| ID | Needed by | Restore/setup | Probe |
|---|---|---|---|
| D-001 | Empty/invalid/non-Git states | New disposable directory and empty core profile | Open prompt; non-Git error without stranding loading |
| D-002 | City/Git/commit flow | Temporary Git repository with known files and initial commit | Snapshot paths/branch match Git; known staged/unstaged/untracked changes |
| D-003 | Approval and run lifecycle | Labeled deterministic CLI fixture for automated tests; authenticated real CLI for live acceptance | Reject spawns nothing; approve streams; cancel terminates; terminal history restores |
| D-004 | Concurrent/reconnect flow | Two disposable profiles, separate workspaces and ephemeral ports | Distinct state; shared-profile refusal; explicit retry without action replay |

No container/database reset is applicable. Back up real state before any
separately approved restore; the profile procedure is in operations.

## Stage 1: Static and contract gate

```sh
python .cycle/trackers.py lint
npm run lint
node scripts/check-doc-links.mjs
```

Expect no errors. Investigate unknown legacy traceability instead of asserting
new verification. Review the diff against the SRS hard constraints: no incidental
TypeScript/backend/styling migration, no fixture imports in production, no raw
renderer shell access. Runtime dependency is `ws`; React is bundled by Vite.
Confirm Electron isolation flags, shared workspace-ID resolution, core production
loopback binding/token check and that production Node spawn remains centralized.

## Stage 2: Automated test matrix

Current collector baseline: **41 files / 490 Vitest cases**, zero skips.
Node and renderer counts below are from runner reports, not source grep. The
coverage command runs both projects together, so do not count its cases twice.

| Layer | Command / selector | Baseline / prerequisites |
|---|---|---|
| Node unit/integration | `npm test -- --project node` | 31 files / 417 cases; real Node environment. Includes real loopback, core subprocess and filesystem seams. |
| Renderer/component | `npm test -- --project renderer` | 10 files / 73 cases; jsdom + test bridge |
| Combined coverage (CI) | `npm run test:coverage` | Same 490 cases; text, HTML and coverage-summary.json in coverage/; no new threshold |
| Renderer build | `npm run build` | Dist index uses relative assets; fresh output required for Electron |
| Electron smoke | `npm run test:e2e` | 1 case; real bridge, version roundtrip, renderer isolation and rendered root |
| Unpacked Electron artifact | `npx electron-builder --dir` then smoke with `CITYBASE_ELECTRON_EXECUTABLE` | Native host prerequisites; see operations for explicit unsigned Windows verification |
| Godot import/regression/transport | `npm run test:godot` | Godot 4.7.2 via GODOT_BIN/PATH; 43 regression checks on macOS/Linux, plus one Windows-specific path case; 13 real WS assertions |

`npm test` is a single pass; `npm run test:watch` watches. `npm test -- --run`
also remains compatible. Enumerate with `npx vitest list --json`. Update the
baseline only for explained additions/removals. Failures, unexpected skips,
zero executed cases or flakes are not GREEN.

CI additionally exercises Windows/macOS Electron smoke and Linux Godot checks.
Those platform results supplement the local report; they do not replace it.

## Stage 3: Functional acceptance on the fresh candidate

Drive the visible app and capture checkpoints. API/headless results do not count
as GUI evidence. Use gui-walkthrough in verification mode with best-effort a11y.

1. Empty boot and invalid/non-Git selection: an actionable state appears and
   loading finishes. Register D-002, reopen, and verify its branch/files/city.
2. Inspect/zoom/orbit the city. Check that all districts of a small fixture can
   be reached; default framing must contain platform/building corners above the
   lower HUD in small/large fixtures and portrait/landscape viewports.
3. Inspect WORK and local quests; completed tracker entries are absent. Submit a
   task, reject approval, and verify no provider child starts and cancellation
   appears. Approve a separate disposable task only when live-provider acceptance
   is available; check actual changed files, streamed activity and terminal state.
4. Cancel an active run, inspect outcome/checks, restart, and confirm durable
   terminal history. Do not infer output correctness from provider success.
5. Commit only the disposable fixture's intended changes. For PR acceptance use
   an explicitly authorized test remote and pushed feature branch; never publish
   a test PR or message to somebody else's repository as an incidental check.
6. Run D-004: separate profiles coexist; shared profile is refused; reconnect does
   not replay a pending mutation. Check keyboard focus/labels/error recovery and
   reduced motion where supported. Record a11y gaps without claiming certification.

## Stage 4: Adversarial, persistence and performance

- RPC unauthorized token closes before boot or invocation; malformed/unknown
  methods yield errors. Run the real oversized-buffer/reconnect harness.
- Unknown workspace IDs cannot supply an arbitrary CLI cwd. Reject/cancel never
  silently approves a run. Preserve explicit unknown outcomes after disconnect.
- Corrupt/unreadable workspace registry rejects all three mutations without
  replacement; malformed run events preserve valid neighbors; failed atomic
  replacement preserves prior disk state. Run the real-filesystem regressions.
- Run `progression.test.js`: exceed the 50/100 activity/history limits, displace
  successes, restart, and preserve aggregate XP and level. Cover legacy migration,
  duplicate records, invalid aggregates, rejection without spawn, cancellation
  before stream drain and after eviction, and failed atomic replacement.
- Check Godot with zero, pending-only and cancelled-only history: success is
  unavailable. Mixed done/failed rows use only that completed denominator; the
  HUD states both completed and recent counts. XP never falls back to recent rows.
- Confirm resource/time/history bounds and forced-stop recovery. Check supplied
  hostile branch/message/path cases in the process/Git tests.
- Measure hot paths only against approved workloads/budgets. There is no accepted
  general scale budget; do not promote the historical 60 fps spike into one.

## Stage 5: Native release constraints

Re-tick the SRS hard constraints. FEAT-006's unresolved renderer hardening,
provider-event truth, lifetime progression and any correctness-critical open
finding must be assessed against the chosen milestone. Build and walk the actual
Godot artifact on every claimed platform. Windows source checks and an Electron
package do not establish Windows Godot distribution. Ad-hoc signing does not
establish notarization/production distribution.

## Stage 6: Report and migration

Record exact SHA, platform/toolchain, fresh-data/artifact proof, all stage
results, counts/skips, GUI coverage, findings and residual release blockers in
`.vv/last-run.md`. Return GREEN only when all required stages pass. A missing GUI
alone can be GREEN ON APPROVAL only under the maintained protocol's explicit
waiver process; an actual failed constraint remains RED.

Only a green full run migrates eligible completed tickets with
`python .cycle/trackers.py migrate <IDs>` and appends an exact-SHA Verified entry
to Unreleased. Never migrate unrelated v4 parity work merely because unit tests
pass. The owner then reviews a concrete release/version plan before publication.
