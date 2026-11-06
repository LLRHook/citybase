# Native Git snapshot processor

`citybase-snapshot` is the required Rust processor for the shared Git snapshot
path. Godot and legacy Electron both reach it through
`gitService.getSnapshot` and the bounded Node `processService.run` boundary.
Node still runs Git with argv arrays in the registered workspace, handles all
mutations, and owns providers, approval, persistence and transport. Rust parses
branch/status, recent commits, tracked paths and blob sizes into the existing
snapshot fields. It does not run a shell, read saves or mutate the repository.
No native process starts for individual provider events.

## Build and package

Source builds require Rust/Cargo 1.85+ alongside the documented Node/Godot tools.
`npm ci` builds the host executable during postinstall; `npm run build` rebuilds
it before Vite. `npm run build:native` rebuilds it directly. `npm run test:native`
runs Rust tests. Build with `--locked`; `Cargo.lock` pins transitive dependencies.
`CARGO_TARGET_DIR` is honored, and `CARGO_NET_OFFLINE=true` uses cached crates.
The npm lockfile and dependency versions are unchanged.

The executable is staged in `native/bin/<platform>-<arch>/`, outside Git.
Electron's `beforePack` hook builds for each selected architecture, packages
that directory and unpacks it from ASAR. macOS arm64 Godot packaging embeds it
beside `citybase-core` in Resources. Packaged apps need no Rust toolchain.
Cross packaging needs the corresponding installed Rust target and linker;
a missing target/build fails instead of silently bundling a host executable.
Universal Electron packages are not supported by this hook. The existing Godot
pipeline remains macOS arm64 and retains its separate distribution gates.

Production resolution uses the bundled core's sibling executable or the
source/Electron unpacked host directory. `CITYBASE_SNAPSHOT_BIN` selects an
explicit executable for diagnostics; a missing override never falls back.
Missing/failed processors yield an explicit snapshot error, never a fabricated
city or a JavaScript fallback. `src/tests/fixtures/legacySnapshot.cjs` is a
frozen differential oracle and is not imported or packaged by production.

## Internal protocol and tests

One JSON object on stdin: `{version:1,status,log,tree,sizes}`. The four fields
are Git stdout strings; absent fields mean empty output. The response is one
JSON object with `version`, `branch`, `ahead`, `behind`, `isDirty`, `files`,
`recentCommits`, `repoTree` and `fileSizes`. Node removes the internal version
before returning the unchanged public snapshot. Unknown versions, invalid JSON
and wrong field types exit 2 with a short stderr message and no snapshot.
Input is bounded at 128 MiB; the Node runner also bounds response output at
64 MiB and execution at 15 seconds. A closed input pipe is a failed process
result, not an unhandled host error.

Rust tests cover parsing and invalid requests. Node integration tests execute
the actual binary for the existing status/size regressions, compare it against
the previous parser over mixed/Unicode/malformed fixtures and a 2,500-file
synthetic corpus, inspect real temporary Git repositories, and verify bundle
lookup, missing-helper refusal and package architecture selection. Windows and
macOS package results must be measured on their actual artifact. No performance
improvement is claimed by this port.

The only direct Cargo dependency is `serde_json = 1.0.149`, reused from the
available cache. The current stable release was checked as 1.0.154; the cached
version provides the needed `Value`, `from_slice` and `to_writer` APIs without
a speculative upgrade. Primary references:

- [Pinned JSON API](https://docs.rs/serde_json/1.0.149/serde_json/)
- [Current JSON release](https://docs.rs/crate/serde_json/latest)
- [Cargo target cache](https://doc.rust-lang.org/cargo/reference/build-cache.html)
- [Electron packaging hooks](https://www.electron.build/v26/docs/features/hooks/)
