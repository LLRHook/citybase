# Citybase

Citybase turns a local Git repository into a city and a workbench for local
coding-agent runs. Godot is the primary frontend, with a shared Node core. The
React/Electron app remains the legacy fallback while native parity is completed.
The package version is 3.0.0; the Godot work is the v4 engineering milestone.

## Start locally

Prerequisites: Git, Node **24.15.0+ in the 24.x line or Node 26.x**, npm and
Godot **4.7.2**. `.nvmrc` selects Node 24. Install/authenticate Claude Code or
Codex separately for real agent work. `gh` is needed for opening PRs.

```sh
npm ci
godot --path godot
```

Godot discovers Node on PATH; `CITYBASE_NODE` selects an explicit executable.
Each frontend starts a core on its own OS-assigned port. The default profile is
shared with legacy Electron, so close the other frontend before using it. To run
multiple Godot instances, use separate terminals and profiles:

```powershell
$env:CITYBASE_CORE_USERDATA = Join-Path $env:TEMP 'citybase-instance-a'
godot --path godot
```

Use another directory for instance B. The core rejects an already-owned profile
and can reclaim dead process claims after forced termination.

For legacy Electron: `npm run dev:desktop`. For its production renderer:
`npm run build` then `npm run start:desktop`. There is no standalone browser
frontend; React requires Electron's preload bridge.

## Use the workbench

1. Open a local directory. Git state supplies the branch, tracked files, changes
   and recent commits. A non-repository has an explicit error state.
2. Inspect the city, or use WORK to select a local tracker quest or enter a task.
3. Start a gated run and approve or reject it. Approval covers the complete
   unattended CLI invocation; rejection starts no provider process.
4. Review outcome, changed areas and declared workspace checks. Completion is
   not a guarantee of generated-code correctness. Terminal history survives restart.
5. Commit explicitly when desired. The commit operation stages workspace changes.
   Push before opening a PR through the core/legacy shell; auto-push is absent.

Godot currently has no branch selector or PR button. The shared core and legacy
shell retain those operations. Current progression is based on recent history
(BUG-037); default small-city framing has BUG-042. These remain open findings.

## Commands

| Command | Purpose |
|---|---|
| `npm run core -- --print-conn` | Scripted headless client connection; prints a sensitive session token and port |
| `npm run dev:desktop` | Legacy Electron HMR development on strict Vite port 5173 |
| `npm run build` / `npm run build:desktop` | Build the legacy renderer into `dist/` |
| `npm run start:desktop` | Launch Electron against the built renderer |
| `npm run lint` | ESLint for renderer, core, Electron and tooling |
| `npm test` | One Node/renderer Vitest run |
| `npm run test:watch` | Interactive Vitest watch |
| `npm run test:coverage` | Same suite with V8 text/HTML/JSON coverage in `coverage/` |
| `npm run test:e2e` | Real Electron smoke; build first |
| `npm run test:godot` | Godot import, GDScript regression and real WS transport checks; set `GODOT_BIN` if needed |
| `npm run package:dir` / `npm run package:mac` | Legacy unpacked/development Electron packaging |
| `npm run package:v4` | Native macOS arm64 Godot + bundled core pipeline; see operations prerequisites |
| `python .cycle/trackers.py lint` | Tracker schema and integrity |
| `node scripts/check-doc-links.mjs` | Validate living Markdown file targets |

Windows development packaging may need Developer Mode/admin privileges for
resource tooling. The explicitly unsigned verification alternative is documented
in [operations](docs/OPERATIONS.md). Windows Godot distribution and full native
release parity are still separate gates.

## Boundaries and documentation

The core binds authenticated loopback WebSocket clients; Electron uses an
isolated sandboxed renderer and allowlisted bridge. Workspace IDs are resolved
in the service layer. Both UIs request run-wide approval. Work executes in the
selected tree, without automatic per-run worktree isolation. The core profile
lock does not coordinate a simultaneous legacy Electron writer.

[Documentation index](docs/README.md) · [Requirements](docs/SRS.md) ·
[Architecture](docs/ARCHITECTURE.md) · [Contracts](docs/DATA_CONTRACTS.md) ·
[Operations/troubleshooting](docs/OPERATIONS.md) ·
[Verification](VERIFICATION.md) · [Foundation evidence](docs/FOUNDATION.md) ·
[Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

<!-- cycle:tracker-setup begin (written by trackers.py install) -->
**Once per clone**, set up the tracker merge driver and pre-commit lint (Claude Code sessions do this automatically):

```bash
python3 .cycle/trackers.py install
```

```powershell
python .cycle\trackers.py install
```
<!-- cycle:tracker-setup end -->
