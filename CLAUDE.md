# Claude Code project notes

[AGENTS.md](AGENTS.md) is the shared handbook. Read it and the
[documentation index](docs/README.md) before changing the project.

Use `gh` for PRs, checks and reviews. Follow conventional commits and the
squash-merge convention; the global `/commit` skill does not produce subjects
this repository accepts. Never bypass hooks.

The primary app is Godot plus the Node core and the required Rust snapshot
processor. Read [native/README.md](native/README.md) for snapshot/build work.
The legacy Electron renderer requires its preload bridge; there is no browser-only frontend. Keep production
services as pure factories where possible and keep native glue thin.

<!-- cycle:project-cycle begin (written by trackers.py install) -->
### Project-cycle files (`bugs.md` / `features.md` / `CHANGELOG.md` / `VERIFICATION.md` / `README.md`)

- Setup, once per clone: `python .cycle/trackers.py install` (merge driver + pre-commit lint). Claude Code sessions and every `trackers.py` command also run it automatically when it is missing.
- Trackers hold active work only and are written **only** with `python .cycle/trackers.py` (format and commands: `.cycle/TRACKERS.md`). Hand edits are blocked by the Claude Code hook and the pre-commit lint.
- Found a bug → `trackers.py add --tracker <bugs.md> --json -` in the same change; never fix silently. Scoping a feature → `add` to `features.md` before coding. `add` mints the id and validates the entry; when the project uses Jira (`.cycle/tracker.json`) it also creates the issue and fills `Jira:`. A cross-app item is filed in each app's tracker with the same id (`--id`).
- Finished work: update every doc the change made stale in the same change, then `set <ID> Status *-pending-migration`, `set <ID> Fix|Implementation "<summary>"`, `set <ID> Docs "<files or none>"`. Only `/protocol-v-and-v` runs `trackers.py migrate` (ledger line + removal). Abandoned work: `close <ID> --reason <r>`.
- A ticket or change that shows a computed value or conclusion (a count, score, status, verdict, alert, recommendation) states its unit and scope, and for any threshold, heuristic, or correlation: the baseline it must beat, a minimum sample, a noise floor, and what it shows when it abstains.
- After any merge or rebase, `python .cycle/trackers.py lint` must report 0 errors before you commit.
- `CHANGELOG.md` is append-only. `VERIFICATION.md` holds procedure and current baselines only; run results go in the CHANGELOG Verified entry.
- Doc drift the current change did not cause is filed as a `docs` BUG, not silently edited. An empty `## Open` is the desired state.
<!-- cycle:project-cycle end -->
