# Historical tracker snapshots

The November 2, 2026 snapshots preserve the complete legacy tracker text before
format-2 adoption. They include the original findings, implementation notes,
disposition discussions, and ticket IDs. They are historical records, not the
current backlog.

- [Bugs before adoption](bugs-2026-11-02.md)
- [Features before adoption](features-2026-11-02.md)

Current work is in the root `bugs.md` and `features.md`. The permanent shipped
ledger is `CHANGELOG.md`. Use `python .cycle/trackers.py show <ID>` to retrieve a
ticket from Git history after it leaves the active tracker. Adoption does not
establish that an old finding is fixed or a release gate is satisfied.
