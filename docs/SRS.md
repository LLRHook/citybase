# Citybase current requirements

## 1. Purpose and scope

Citybase is a local desktop interface over one selected Git workspace and local
coding-agent CLIs. Godot is the primary frontend; Electron remains a legacy
fallback. It is neither a hosted agent service nor a replacement provider.

This baseline normalizes the product boundary in [ROADMAP.md](../ROADMAP.md)
and the [v4 charter](v4-game-engine.md). It preserves the original review in
[srs-and-plan-of-action.md](srs-and-plan-of-action.md); its FR-A/FR-V1/NFR
identifiers keep their historical meaning. Current requirements use the `CB-`
prefix. Priorities below apply to this existing core boundary, not new features.
Acceptance descriptions are derived from those sources and the code and do not
add a new performance, accessibility or distribution promise.

## 2. Functional requirements

Each row states required behavior, its acceptance/verification, and the current
delivery state. "Implemented" alone does not mean release-verified.

| ID | Priority | Requirement and acceptance | Verification | Delivery / evidence | Acceptance criteria (derived) | UI |
|---|---|---|---|---|---|---|
| CB-FR-001 | Must | The app shall restore the recent workspace or show an actionable open prompt. Invalid or non-Git directories shall produce an intelligible state. | Boot/workspace tests; fresh-profile GUI journey | Implemented; `bootPayload`, `AppAutoBoot`, `WorkspaceErrorStates`, Godot `main.gd` | Given a fresh profile, when it boots or an invalid folder is selected, then it shows an actionable open/error state without hanging. | Godot open prompt and legacy workspace states |
| CB-FR-002 | Must | The city shall project real Git files/status into districts and buildings. Camera controls shall let the user inspect the city. | Projection tests; Godot small/large-repo GUI journey | Implemented with viewport-aware initial framing; `city_builder.gd`, `cityModel` tests | Given a known Git fixture, when opened and inspected, then buildings/status match the fixture and camera controls reach its districts. | Godot city/camera and legacy city |
| CB-FR-003 | Must | The workbench shall show local tracker quests and permit a freeform task. Completed tracker items shall not appear as open quests. | `questService` tests; WORK GUI journey | Implemented; `questService.cjs`, `workbench.gd` | Given open and completed tracker entries, when WORK loads, then only active quests appear and a prompt can be entered. | Godot WORK quest list and task form |
| CB-FR-004 | Must | Git operations shall resolve a registered workspace, reject invalid branch/message input, and report failures. | `gitMutations`, `ipcHandlers`, branch tests | Implemented core API; Godot has commit but lacks a branch selector. | Given a registered workspace, when an invalid branch/message or unknown workspace is submitted, then the operation is refused with no unintended Git mutation. | Godot commit form; legacy branch and commit controls |
| CB-FR-005 | Must | Provider detection shall report installed Claude/Codex CLIs and actionable missing-provider errors. | Detection, resolver and adapter tests | Implemented; account authentication remains the user's provider setup | Given installed or missing CLIs, when detection runs, then each result reflects the host and failed dispatch is actionable. | Provider status and dispatch errors |
| CB-FR-006 | Must | Dispatch shall return without waiting for the CLI. Approval/rejection shall precede spawn; cancel shall reach the child. | Manager/adapter/IPC tests; approval/reject/cancel GUI journey | Implemented for UI approval mode; run-wide approval, no per-tool gate | Given a task awaiting approval, when rejected, then no provider starts; when approved and cancelled, then the child terminates. | Approval dialog, running status and cancel |
| CB-FR-007 | Must | Displayed agent activity shall reflect observed provider output and terminal status. | Provider-event and settlement tests; live-provider evidence | Claude streams real NDJSON; Codex fidelity remains partial (BUG-003) | Given provider output and settlement, when events render, then displayed activity/status match observed output without invented edits. | City activity and run events |
| CB-FR-008 | Must | Review shall show outcome, observed changed areas and declared checks without making raw code the default experience. | Review model/detail tests; WORK GUI journey | Implemented; observations do not prove authorship or generated-code correctness | Given a settled run, when review opens, then outcome, observed changed areas and available checks are visible without raw code by default. | Godot outcome and legacy run review |
| CB-FR-009 | Must | Terminal history shall survive restart and tolerate malformed event entries without discarding valid history. | `runStore`, manager tests and restart journey | Implemented, bounded; PRs #70/#71 regressions | Given valid runs surrounding malformed events, when saved/restored or restarted, then valid terminal neighbors survive within documented caps. | Run history and restored detail |
| CB-FR-010 | Should | The living layer shall derive activity/vitals/progression from observed repository and run state. Earned progression shall not regress when history is pruned. | Godot regressions; long-history/restart tests | Implemented for recorded profile XP; legacy migration recovers only retained evidence | Given more runs than the activity window, when old summaries leave it, then earned recorded progression remains stable across pruning and restart. | Godot living-layer HUD |
| CB-FR-011 | Must | Connection failure shall be visible, permit explicit retry and avoid replaying unknown pending actions. | Real WebSocket transport harness | Implemented; 1 MiB Godot buffer limit | Given a lost acknowledgement or oversized response, when disconnected and retried, then the error is visible and pending actions are not replayed. | Godot connection error and Retry |
| CB-FR-012 | Must | A distributable shall launch with its required runtimes bundled and satisfy the platform parity checklist. | Native export/package and fresh-machine GUI journey | Partial: historical macOS arm64 package evidence; Windows Godot packaging/parity pending | Given an exported artifact on a claimed platform, when launched without dev tooling, then the bundled core and complete required parity work. | Native installed app |

## 3. Quality requirements and constraints

| ID | Priority | Requirement and acceptance | Verification | Delivery | Acceptance criteria (derived) | UI |
|---|---|---|---|---|---|---|
| CB-NFR-001 | Must | Persisted state writes shall be atomic and serialized within the owning process; failed registry reads shall not overwrite prior workspaces. | Real-filesystem persistence regressions | Implemented. Cross-frontend concurrent writers remain unsupported. | Given an unreadable registry or failing replacement, when a mutation/save runs, then the prior valid file is preserved. | none |
| CB-NFR-002 | Must | Agent/session resources shall have explicit bounds and cancellation behavior. | Process/manager tests; adversarial protocol steps | Partial; documented process/history bounds exist, BUG-014 awaits residual verification. | Given concurrent/long-running work, when limits or cancel apply, then documented resource bounds and terminal behavior hold. | none |
| CB-NFR-003 | Must | Node/Git behavior shall work on the macOS target and Windows development host, including spaces and native paths. | Platform CI; native-path and process tests; platform GUI/export | Partial; Windows source gates pass; native platform parity remains pending. | Given spaces and native paths on each target host, when Git/process/startup tests run, then platform invocation succeeds. | none |
| CB-NFR-004 | Must | Performance claims shall identify workload, measurement and limit. | Stage 4 measurements | Partial; no numeric production budget is approved; the historical spike is not a scale guarantee. | Given a performance claim, when assessed, then its workload and numeric budget have evidence or remain explicitly unspecified. | none |
| CB-NFR-005 | Must | Lint, build, meaningful Node/renderer tests and desktop smoke shall gate changes; coverage and counts shall be reproducible. | Local gate and CI commands in VERIFICATION.md | Foundation tooling implemented; all-platform results must be attached to the actual PR head. | Given a clean candidate, when its local gate executes, then all required layers run with recorded counts and no failures or unexplained skips. | none |
| CB-CON-001 | Must | Electron shall keep context isolation, no Node integration, sandboxed rendering and an allowlisted bridge. External-navigation/CSP hardening shall be explicit. | Security/static tests and desktop smoke | Partial; isolation/bridge exist, FEAT-006 navigation/CSP/fonts remains open. | Given a renderer, when Node access or unapproved navigation is attempted, then the documented boundary prevents it; missing hardening remains partial. | Electron renderer |
| CB-CON-002 | Must | The Godot transport shall authenticate a session token before boot/RPC, and the daemon shall bind loopback in production construction. | RPC authorization and startup integration tests | Implemented. Possession of the token grants the local capability set; no multi-user roles. | Given a missing or wrong token, when a WS client connects, then it receives no boot/capability access and closes unauthorized. | none |
| CB-CON-003 | Must | Providers shall be replaceable behind AgentProvider; no synthetic result shall be described as proof of real model quality. | Adapter/manager tests and evidence review | Shared interface implemented; see CB-FR-007 for Codex limitation. | Given an adapter or fixture, when an outcome is reported, then provider-neutral contracts hold and fixture/model-quality claims stay distinct. | none |
| CB-CON-004 | Must | The project shall remain local-first, JavaScript/CJS plus GDScript, without incidental cloud/backend, TypeScript or styling-system migration. | Diff, manifest and source review | Implemented; no unscoped migration appears in the foundation diff. | Given the foundation diff, when manifests and sources are reviewed, then no unscoped migration or backend/styling platform appears. | none |
| CB-CON-005 | Must | Release shall require an exact-head green verification result, complete required parity, explicit version decision and platform distribution gates. | Release checklist in OPERATIONS.md | Partial; procedure defined, native parity and an explicit release decision are pending. | Given a release candidate, when publication is proposed, then its exact-head verification, required parity and explicit version decision are present. | none |

## 4. Traceability and delivery plan

Requirements trace to implementation/test owners in the tables above and the
[architecture](ARCHITECTURE.md) / [contracts](DATA_CONTRACTS.md). Foundation
tickets are FEAT-007, FEAT-011, FEAT-012, FEAT-1793649547 and BUG-1793649547.
Active blockers and unfinished work remain in the root trackers; earlier complete
records remain in [history](history/README.md).

1. Finish the existing PR queue and retain the shared Windows/persistence fixes.
2. Establish the supported toolchain, test environments, CI and current docs.
3. Resolve provider-event truth and remaining security gaps.
4. Re-run full native parity on each claimed platform before a release decision.

Godot source/development starts may auto-register the Citybase checkout for an
empty profile; exported first-run builds show the open prompt. CB-FR-001's
empty-profile prompt acceptance refers to that packaged-user flow.

## 5. Product decision and evidence gaps

- On November 2 the owner approved closing
  [PR #69](https://github.com/LLRHook/citybase/pull/69) as superseded by the Godot
  direction. Its proposal branch remains preserved; the primary frontend
  direction is unchanged.
- Windows Godot distribution and a fresh macOS package are not proven by Windows
  source tests or the legacy Electron smoke.
- Legacy runs already pruned before XP migration cannot be recovered.
- Full Codex event fidelity, external-navigation/CSP/fonts,
  and older residual findings remain tracked; do not mark them complete by adoption.
- No quantitative scale, startup/memory, comprehensive accessibility or blanket
  secret-redaction guarantee is accepted or proven by this baseline.

## Revision history

| Rev | Date | Commit | Mode | Summary |
|---|---|---|---|---|---|---|
| 1 | 2026-11-02T15:20:09-05:00 | 44a7ecdcbd86 | ADOPT | Current foundation baseline; historical sources retained |
| 2 | 2026-11-02T15:22:13-05:00 | 562acebfe691 | REVISION | Normalize partial delivery for requirement indexing |
| 3 | 2026-11-02T15:34:25-05:00 | 53ec3479d43e | REVISION | Clarify source-development first-run behavior |
| 4 | 2026-11-02T16:06:08-05:00 | ce1ee2590151 | REVISION | Record owner-approved closure of the superseded Electron proposal |
