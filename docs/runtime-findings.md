# Runtime changes for the living city

This is the runtime subtask handoff for integration into the repository trackers.

## Implemented

- **Building inspection:** `workspace.readFile(workspaceId, path)` returns `{ path, content, binary, truncated, size, error }`; UTF-8 reads are limited to 128 KiB. Non-text files are identified without rendering their bytes. Missing files return a displayable error.
- **Building changes:** `git.getFileDiff(workspaceId, path)` returns `{ text, truncated, error }`. It shows working-tree changes against HEAD, including staged edits and untracked additions, supports repositories before their first commit, and limits output to 256 KiB. It never stages, resets, or changes the index. This is a current workspace comparison, not attribution of edits to a particular agent.
- **Path boundary:** Both inspection methods require a remembered workspace. Absolute paths, traversal, `.git` internals, non-regular files, and symlink escapes are rejected. Git receives literal pathspecs and disables external diff/text-conversion helpers.
- **Workspace refresh defect:** Refresh previously invoked IPC without a workspace ID, swallowed the error, and performed a second scan. The hook now uses the response from `git.refresh(workspaceId)` and surfaces startup/refresh/close failures while preserving the last usable city.
- **Agent dispatch path defect:** `agents.startRun` now requires `workspaceId`; the main process retrieves the remembered path and overrides renderer-provided `repoUrl`.
- **Fabricated Codex activity defect:** Codex now invokes `exec --json` and incrementally parses real session messages, commands, file changes, usage and failure events. It does not synthesize edits, test passes, or PR outcomes from an exit code. Internal reasoning items are omitted.
- **Scouting:** `readOnly: true` selects the Codex read-only sandbox. Claude scouting uses `dontAsk`, a `Read,Glob,Grep` tool allowlist and strict MCP configuration. Claude's tool restriction is not an OS filesystem sandbox; normal write-capable runs retain the pre-existing approval flow.
- **Quest identity defect:** Runs now expose and persist `workspaceId`, `rootPath`, `prompt` (up to 8,000 characters), and `readOnly`. Restored records expose `historical: true`. `agents.listRuns({workspaceId})` filters by city. Historical event paths/tool/status are retained through the bounded run store.
- **Verified guild progression:** Runs also retain `skill`, `questSkill` (`survey`, `craft`, `repair`) and `outcome`. A successful survey must contain real parsed assistant text to receive `{kind: 'scout', verified: true}`. Craft/repair must finish successfully and change a bounded repository fingerprint to receive `{kind: 'build', verified: true, filesChanged}`. Read-only quests can never receive crafting credit. Only SHA-256 hashes and counts are persisted for change proof, never fingerprinted file contents. Old runs without a quest skill receive no retroactive proof.
- **Terminal lifecycle defects:** Rejection emits a terminal event; cancelling a pre-flight approval never calls an unstarted adapter. After execution, a separate terminal event fires only when the process and its outcome verification have settled, so a provider's earlier `turn.completed` message cannot strand the city in its live state. Live approval events also retain the manager's nested prompt/mode/path summary.

## Validation

The targeted runtime suite passed **167 tests across 8 files**, including integration tests against temporary Git repositories for staged/unstaged files, deletions, untracked files, literal pathspecs, unborn repositories and unchanged index bytes. Targeted ESLint passed.

Codex JSON event behavior was checked against the installed CLI (`0.152.1`) and [official non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode). Claude flags were checked against the installed Claude Code CLI (`2.1.259`).

A genuine authenticated Codex scouting run completed through the adapter and manager against a temporary Git fixture. Six live events included a real README read and the correct final answer. The fixture remained clean and its README bytes were unchanged. Evidence is in `artifacts/runtime-scout.json`. This fixture run used `readOnly: true` plus `--ignore-user-config`, `--ephemeral` and low reasoning effort to keep verification isolated; the normal app retains the user's CLI configuration.

Progression and lifecycle validation passed **161 tests across 7 files**. Integration cases include genuine file changes, pre-existing work that is merely staged/committed, failed/unchanged/read-only quests, size limits, symlink escapes, persistence, and final-event ordering. A second genuine Codex execution completed both a survey and a one-file crafting quest; both produced verified outcomes that survived run-store sanitization and manager restoration. The README remained unchanged and the created file matched the requested content exactly. Evidence: `artifacts/runtime-progression-proof.json`.

## Existing limitations outside this slice

- Agent runs execute inside the chosen working tree. The branch field is descriptive; Citybase does not create an isolated agent worktree automatically.
- The legacy `agents.produceDiff` endpoint still uses intent-to-add/reset for untracked files and omits staged edits; the new game should use the read-only building diff endpoint instead. Historical run diffs are unavailable.
- The legacy `RunDetail` component automatically executes package checks based on a polled run object. The new city shell should use deliberate checks if it exposes them.
- Persisted history retains at most 60 events per run, each with at most 2,000 text characters. It is a concise record rather than a complete process transcript.
- Crafting proof considers Git-visible changes against a fixed pre-run base and hashes only relevant files. It checks at most 64 files, 256 KiB per file, 2 MiB total contents and 512 KiB of Git diff output. Existing dirty files count toward these limits. Larger/unsupported/unreadable states conservatively withhold credit; they do not fail an otherwise successful quest. Ignored-only changes do not earn credit. Concurrent human edits can contribute to the observed state change, so the proof confirms a changed repository during a successful run, not exclusive authorship or code correctness.
