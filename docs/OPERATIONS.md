# Citybase operations

## Setup and local runs

Install Git, Node from the supported `package.json` range, npm, and Godot 4.7.2.
`.nvmrc` selects the default Node 24 line; Node 26 is also supported. Install and
authenticate the provider CLI separately if real agent work is needed. `gh` is
required only for the PR operation.

```sh
npm ci
python .cycle/trackers.py install
godot --path godot
```

Use `CITYBASE_NODE` if Godot must use a specific Node executable. Use
`GODOT_BIN` for automated test/packaging scripts when Godot is not on PATH.
The legacy development path is `npm run dev:desktop`; a built legacy run uses
`npm run build` then `npm run start:desktop`.

## Profiles and backups

Default state directories: `%APPDATA%/Citybase` on Windows,
`~/Library/Application Support/Citybase` on macOS, and
`${XDG_CONFIG_HOME:-~/.config}/Citybase` on Linux. Both frontends can use these
files, but they must not write the same profile concurrently. The core lock
only excludes another core.

For concurrent Godot instances, use a different `CITYBASE_CORE_USERDATA` per
terminal. This selects the core's state; it does not redirect Electron state.

```powershell
$env:CITYBASE_CORE_USERDATA = Join-Path $env:TEMP 'citybase-profile-a'
godot --path godot
```

Use another directory for instance B. Never reset a real profile for testing.
Create a disposable profile and disposable Git fixture instead. Fresh profiles
contain no history or remembered workspace; no production seed module is needed.

For backup, close both frontends and their cores, then copy `workspaces.json`
and `runs.json` together to a dated directory. Keep the originals until the
restore is verified. To restore, stop writers, copy back the files, restart one
frontend, and confirm recent workspace and terminal history. Do not edit stale
lock claims while an owning process is alive. JSON files may contain local paths,
prompts/events and repository details; treat backups accordingly.

## Verification and recovery

Follow [VERIFICATION.md](../VERIFICATION.md). In brief: install from the lockfile,
run lint/build, Node/renderer tests and coverage, Electron smoke, then Godot
regression/real transport checks. Use a fresh committed checkout for the final
local gate. Preserve the executed SHA and full logs under gitignored `.vv/`.

| Symptom | Recovery |
|---|---|
| Core startup failed | Check Node/`CITYBASE_NODE`, writable profile, and the visible startup reason; retry after fixing the cause. |
| Profile already in use | Close its owning core or use a distinct profile. Do not remove a live process's claim. |
| Disconnected / oversized result | Inspect the visible close reason. Retry explicitly; reconcile history before repeating any mutating action whose acknowledgement was lost. |
| Corrupt workspace registry | Stop writers, back up the file, restore/repair its JSON shape, then restart. Mutations intentionally refuse to overwrite it. |
| Electron cannot launch from an Electron-based host | Clear `ELECTRON_RUN_AS_NODE` in that terminal. The smoke runner removes the inherited value itself. |
| City partly outside viewport | Zoom out; BUG-042 tracks initial framing. |
| XP stops growing or falls | BUG-037: current progression derives from a recent bounded window. |

## Packaging and release

`npm run package:dir` builds the legacy unpacked Electron app. On Windows,
resource/signing-tool extraction can require Developer Mode/admin privileges.
For an explicitly unsigned verification package, use
`npx electron-builder --dir --config.win.signAndEditExecutable=false`; this does
not establish production signing or distribution readiness. The smoke accepts
`CITYBASE_ELECTRON_EXECUTABLE` pointing to the unpacked executable.

`npm run package:v4` is the existing **macOS arm64** Godot/Node SEA pipeline.
Run it on a Mac with codesign, Godot export templates and an official Node with
`--build-sea` (use the supported Node 26 line). It creates an ad-hoc signed app,
not a notarized production installer. It is not a Windows Godot packager.

Before cutting a release:

1. Finish the selected milestone's Must requirements and named high-risk gaps.
2. Run the complete V&V procedure at the exact committed candidate. Automated
   checks alone do not waive manual GUI, real-provider or native parity gates.
3. Migrate only eligible completed tickets through the tracker writer; retain
   history and a truthful Verified record tied to the tested SHA.
4. Present the actual version/changelog, native artifacts, signing/notarization
   state and remaining risks for the explicit release decision.
5. Follow the maintained release workflow to freeze, tag and publish only after
   that decision. No cloud deployment command exists in this repository.

Windows Godot packaging/parity, fresh macOS native validation and production
distribution hardening remain separate from this development foundation.
