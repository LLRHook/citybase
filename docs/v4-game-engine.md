# v4.0 — "The Game" epic: Godot frontend, Node core

Decision (2026-07-08): Citybase v4 rebuilds the presentation tier in a real
game engine so the app can carry the full original vision — the living
command-center city with ambient life, agent avatars, quests, and vitals —
with none of the prototype's fiction. Everything the first commit faked
becomes real, driven by real Git state and real agent runs.

This is a **frontend rewrite, not a product rewrite**. The agent harness is
the most valuable and hardest-won code in the repo and it does not move.

## Architecture: Godot face, Node brain

```text
┌────────────────────────────────────────────┐
│ Godot 4.7 frontend (the game)              │
│   3D isometric city · agent avatars ·      │
│   quest board · run detail · approvals ·   │
│   activity feed · vitals · XP              │
│                                            │
│   WebSocketPeer (client)                   │
└──────────────────┬─────────────────────────┘
                   │ JSON-RPC over localhost WS
                   │ (request/response = today's citybase:* channels,
                   │  push notifications = the AgentEvent stream)
┌──────────────────┴─────────────────────────┐
│ citybase-core (headless Node daemon)       │
│   agentManager · Claude/Codex adapters ·   │
│   processService/spawnStream · gitService ·│
│   workspaceService · runStore · checks ·   │
│   approval gate                            │
└──────────────────┬─────────────────────────┘
                   │ child_process (unchanged)
             git · claude · codex · npm · gh
```

Why this split is non-negotiable:

- **Godot is weak exactly where our core is strong.** `OS.execute` blocks
  the calling thread; `OS.create_process` discards stdout; streaming a CLI
  requires the newer pipe API or third-party addons. Our streaming runner
  (`spawnStream`: line-buffered NDJSON, kill escalation, timeout policy,
  32MB bounded buffers) took three bug-waves to harden. It stays in Node.
- **The core is already extraction-ready.** Every main-process module is a
  pure factory with injected dependencies (`createIpcHandlers`,
  `agentManager`, `runStore`, `workspaceChecks`…) — Electron is thin glue.
  Re-gluing the same handler map to a WebSocket server is a small, mostly
  mechanical change, and the existing unit tests keep guarding it.
- **The security model survives.** The approval boundary, workspace-id
  validation (BUG-005), and the single-spawn-site rule live in the core, so
  no frontend — Godot or Electron — can bypass them. The WS server binds
  `127.0.0.1` only and requires a session token the core mints at startup
  (passed to the frontend via the spawn environment).

### Wire protocol

- **Transport:** WebSocket on localhost, JSON messages.
- **Requests:** `{ id, method, params }` where `method` is exactly today's
  channel name (`workspace.pick`, `git.getSnapshot`, `agent.startRun`,
  `agent.approve`, …). Responses: `{ id, result }` or `{ id, error }`.
- **Push:** `{ event: 'agent-event', payload: { runId, event } }` — the same
  envelope `pumpAgentEvents` emits today — plus `boot` (the current boot
  payload) on connect.
- **Contract source of truth:** `docs/agent-runtime.md` + the preload
  surface. FEAT-010's parity-test idea graduates into a protocol conformance
  test both hosts (Electron preload, WS server) must pass.

One caveat to design around: `workspace.pick` uses Electron's native folder
dialog today. In the sidecar the dialog moves to the frontend (Godot's
`FileDialog` with `access = FILESYSTEM`), and the core validates + registers
the chosen path (same validation as today; the core never trusts the path
blindly — it verifies it is a directory and a git repo like `pickWorkspace`
does now).

## What "no deliberate cuts" means concretely

Every fictional system from the founding prototype returns as a real one:

| Prototype fiction (first commit)        | v4 real system |
|-----------------------------------------|----------------|
| Jira/Bitbucket quest board (seed data)  | Quest board fed by `features.md` / `bugs.md` (already structured tickets with priority/status) and run history; a run dispatched from a quest links back to it |
| Adventurers Alpha-7 / Delta-3, houses   | One avatar per live agent run, walking between the buildings its event stream touches; provider = the avatar's "class" |
| XP, levels, +240 XP toasts              | Derived from persisted `runs.json`: completed runs, districts touched, checks passed |
| Build health / coverage / velocity      | Real vitals: checks results, test counts, lint status, commit cadence from `git log` |
| Activity feed (frozen mock)             | Live feed: run events + commits + branch switches |
| Flat hex map with beams                 | True 3D city: lighting, bloom, day cycle, camera fly-to on activity |
| Analysis = raw diff centerpiece         | The Phase-4 Outcome/Changed-Districts surface, rendered in-engine; raw diff stays a debug drawer |

## Phases

**Phase A — core extraction (`citybase-core`).** Move `electron/main`
services into a runtime-agnostic package with a WS JSON-RPC facade beside
the existing Electron glue. Electron app keeps shipping, now a thin client
of the same handler map. Deliverables: daemon entry (`core/server.cjs`),
protocol conformance test, all existing tests green. No Godot yet.

**Phase B — Godot spike (go/no-go gate, time-boxed).** Minimal Godot 4.7
project: spawn the sidecar, authenticate, render a real repo's districts as
3D blocks, dispatch one read-only run, glow the touched building live from
the event stream. Proves WS client, JSON throughput, text rendering, and
mac/win export. If the spike fails its gate, we fall back to the WebGL-in-
Electron path with the core extraction already banked.

**Phase C — the 3D city.** Full city: district platforms, building
extrusion by file weight, lighting/bloom/environment, camera orbit + fly-to,
agent avatars with pathing, completion ripples, reduced-motion setting.

**Phase D — the workbench.** Quest board, run detail (Outcome / Changed
Districts / live activity), approval modal (hard gate wired to the core),
commit + PR actions, workspace/git error surfaces (BUG-007 parity).

**Phase E — the living layer.** Activity feed, vitals, XP/levels, ambient
simulation (idle citizens, traffic on recent-commit paths, day/night).

**Phase F — parity gate + cutover.** A checklist mirroring the v1 ship gate
runs against the Godot app. Only at parity does the Electron shell retire
(kept in-tree one release as `--legacy-shell` fallback). Packaging moves to
Godot export templates (mac notarization handled in FEAT-003's successor).

## Phase B gate results (2026-07-08, macOS arm64, Godot 4.7.stable.official)

The spike (`godot/`) ran the full gate against the real core and the real
`claude` CLI in one session:

| Gate item | Result |
|-----------|--------|
| Spawn core + env token handoff | ✅ `OS.set_environment` → `OS.create_process`; child inherits; token auth accepted |
| WS JSON-RPC client | ✅ `WebSocketPeer` + retry-until-boot; one pitfall found: JSON ids arrive as floats — normalize with `int()` before matching pending requests |
| Real snapshot → 3D city | ✅ 125 tracked files → 10 lit district platforms, 87 extruded buildings, bloom/glow environment, per-district `Label3D` |
| Live run → building glow | ✅ dispatched a read-only claude run from GDScript; the `Read README.md` tool-use event glowed the README building via tween within ~1s of the stream |
| Text UI | ✅ `RichTextLabel` event trail with bbcode colors + auto-scroll |
| Frame rate | ✅ 60 fps after warmup (vsync-capped) with the citybase repo loaded |
| Editor-independent run | ✅ `--export-release macOS` (universal, ad-hoc signed, testing distribution) produced `CitybaseSpike.app`; the packaged app ran the full boot→core→snapshot→city flow at 60 fps with no editor present. Two export gotchas recorded: arm64 requires `textures/vram_compression/import_etc2_astc=true`, and exported builds must take the repo root from `CITYBASE_REPO_ROOT` (res:// has no filesystem path outside the editor) |
| Windows export | not attempted (no Windows machine in this loop) — templates are installed; record the result when the repo is next opened on the Windows box |

**Verdict: GO.** Phases C–F may be ticketed.

## Risks / honest notes

- **Text-heavy UI in an engine is real work.** Godot's Control nodes +
  `RichTextLabel` are far better than Unity's UI for this, but diffs,
  scrollback, and IME/text-selection will still cost more than DOM. This is
  the main reason the raw-diff drawer stays minimal in-engine.
- **Two runtimes ship in one app** (Godot + Node sidecar). The installer
  must bundle a Node runtime or a pkg'd binary for the core — solvable
  (single-file executables) but it's new packaging surface.
- **GDScript is the frontend language** (velocity, first-party docs); C#
  only if profiling forces it. The core stays plain CJS.
- **The spike is the contract.** No Phase C work starts until Phase B's
  gate passes on macOS and Windows.
