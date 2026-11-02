# Citybase documentation

This index owns documentation routing. The manifest version is still 3.0.0;
"v4" names the Godot engineering work, not a newly published release.

| Document | Owns |
|---|---|
| [SRS](SRS.md) | Current product boundary, requirements, acceptance and delivery gaps |
| [Architecture](ARCHITECTURE.md) | Components, trust boundaries, stack decision and rationale |
| [Data contracts](DATA_CONTRACTS.md) | RPC operations, events, disk formats, limits and compatibility |
| [Agent runtime](agent-runtime.md) | Provider interface, CLI behavior and run lifecycle |
| [Domain model](domain-model.md) | Meaning of the city and workbench concepts |
| [Operations](OPERATIONS.md) | Setup, profiles, backups, troubleshooting and release procedure |
| [Foundation delivery](FOUNDATION.md) | Scope, evidence and remaining gates for this foundation change |
| [Verification](../VERIFICATION.md) | Repeatable commands and manual acceptance procedure |
| [Roadmap](../ROADMAP.md) | Current sequencing and deferred scope |
| [Contributing](../CONTRIBUTING.md) | Branch, commit, testing and PR workflow |
| [v4 charter](v4-game-engine.md) | Godot direction and dated phase-gate evidence |
| [Historical SRS](srs-and-plan-of-action.md) | Original prototype review and requirement provenance |
| [Historical trackers](history/README.md) | Complete pre-adoption ticket records and disposition |

Living docs describe current behavior; dated records describe the observed
baseline then. Test counts belong in `VERIFICATION.md`. Run reports belong in
`.vv/` and the append-only changelog only when the relevant verification gate
passes. Do not turn a prior platform result into evidence for a new build.
