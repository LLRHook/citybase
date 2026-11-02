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
| v4 C/D/E | 3D city/camera, workbench, quests, approvals, outcomes, living layer | Source regressions pass; camera and lifetime XP findings remain |
| v4 F | macOS arm64 bundled-core/export script and parity checklist | Windows Godot distribution and fresh native parity are not complete |
| Foundation | Supported Node, separated test environments, coverage, platform CI, maintained trackers and canonical docs | Exact-head evidence and remaining gates in docs/FOUNDATION.md |

## Next work

1. Resolve the PR #69 product-direction decision against the Godot charter.
2. Finish the dependency PR against the supported Node baseline.
3. Close correctness and trust gaps: truthful Codex events (BUG-003), durable
   progression (BUG-037), initial camera framing (BUG-042), renderer
   navigation/CSP/fonts (FEAT-006), and re-confirm older residual bug findings.
4. Add focused workspace-hook coverage (FEAT-009) and assess remaining inherited
   test gaps from actual behavior rather than the historical review alone.
5. Produce and walk native Godot artifacts on the claimed platforms; complete
   production packaging/signing/notarization/distribution (FEAT-003).
6. Run complete V&V at the release SHA, migrate eligible tickets and present the
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
