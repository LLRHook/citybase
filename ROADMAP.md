# Citybase roadmap

## Current baseline

Citybase is a local repository-as-city workbench with a Godot frontend and Node
core. The React/Electron shell remains available while native parity is open.
`package.json` is still version 3.0.0; v4 names engineering work, not an already
published release. Current acceptance belongs in [docs/SRS.md](docs/SRS.md).

The original phase plan and its full text are preserved in
[the pre-foundation roadmap](docs/history/roadmap-2026-11-02.md). Dated v4
gate evidence remains in [the charter](docs/v4-game-engine.md). Neither historical
record substitutes for testing a new candidate.

## Delivered implementation

| Milestone | Implementation | Current verification limits |
|---|---|---|
| v1 desktop and Git | Live workspace/Git projection, CLI adapters, approvals, checks, commit/PR surfaces | Legacy shell retained; auto-push/per-run worktrees absent |
| v2/v3 living and durable workbench | Streaming Claude activity, live city, restartable terminal history | Codex event fidelity and older residual findings remain tracked |
| v4 A/B | Shared authenticated loopback core and Godot spike | Original Mac spike is dated evidence |
| v4 C/D/E | 3D city/camera, workbench, quests, approvals, outcomes, living layer | Recorded XP and initial framing have regressions; full native parity remains |
| v4 F | macOS arm64 bundled-core/export script and parity checklist | Windows Godot distribution and fresh native parity are not complete |
| Foundation | Supported Node, separated test environments, coverage, platform CI, maintained trackers and canonical docs | Exact-head evidence and remaining gates in docs/FOUNDATION.md |

## Next work

The November 2 PR queue is finished. The owner approved closing
[PR #69](https://github.com/LLRHook/citybase/pull/69) as superseded by the Godot
direction; its proposal branch remains preserved. The merged foundation and
each PR's disposition are recorded in [docs/FOUNDATION.md](docs/FOUNDATION.md).

1. Maintain the supported dependency/runtime baseline and the cross-platform
   gates established by the combined foundation delivery.
2. Close correctness and trust gaps: truthful Codex events (BUG-003), renderer
   navigation/CSP/fonts (FEAT-006), and re-confirm older residual bug findings.
3. Add focused workspace-hook coverage (FEAT-009) and assess remaining inherited
   test gaps from actual behavior rather than the historical review alone.
4. Produce and walk native Godot artifacts on the claimed platforms; complete
   production packaging/signing/notarization/distribution (FEAT-003).
5. Run complete V&V at the release SHA, migrate eligible tickets and present the
   version/changelog/artifacts for the owner's release decision.

No new Electron-only product feature should land without an explicit decision
revising the v4 direction. A dependency or shared-harness fix may still support
both frontends. Do not begin a backend/cloud platform, remote issue integration,
TypeScript migration or styling-system replacement as foundation side effects.

## Product boundary

One selected local Git workspace, installed Claude/Codex through adapters,
visual progress, explicit run-wide approval, and an outcome-first review are the
core. A hosted SaaS, cloud sandbox fleet, plugin marketplace, remote tracker
service and multi-repository orchestration are outside this milestone.

The authoritative backlog is [features.md](features.md) and [bugs.md](bugs.md),
not an assumption that every historical phase checkbox is a current release pass.
