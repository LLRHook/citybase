# CLAUDE.md

Claude Code reads this file preferentially. The canonical instructions live in [AGENTS.md](./AGENTS.md) — they apply to every coding agent (Claude, Codex, Gemini, Aider, local models). This file points there and adds Claude-specific notes.

## Read first

- **[AGENTS.md](./AGENTS.md)** — project rules, commit convention, where state and mock data live, what's in/out of scope
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — PR workflow and commit format the hook enforces
- **[ROADMAP.md](./ROADMAP.md)** — phased plan and DoD
- **[docs/domain-model.md](./docs/domain-model.md)** — plain-language entity definitions
- **[docs/agent-runtime.md](./docs/agent-runtime.md)** — provider-neutral `AgentProvider` contract

## Claude Code specifics

### Use `gh` for PR / CI work
The repo has GitHub remote and the user has `gh` authenticated. Read PR status, CI checks, comments, and reviews via `gh` rather than the GitHub web UI or unauthenticated `curl`. On Windows the binary lives at `/c/Program Files/GitHub CLI/gh.exe` — invocations of that path are pre-allowed in [.claude/settings.json](./.claude/settings.json) for the common read-only subcommands.

### Commit hooks are live
Every `git commit` runs through [hooks/commit-msg](./hooks/commit-msg). Claude Code sessions also trigger [.claude/hooks/validate-commit-msg.sh](./.claude/hooks/validate-commit-msg.sh) as a `PreToolUse` Bash hook. **Don't invoke the global `/commit` skill** — it writes commit subjects as the literal branch name, which the hook rejects. Use `git commit -m "<type>: ..."` directly per the format in CONTRIBUTING.md.

### CI is the merge gate, CodeRabbit is advisory
- CI in `.github/workflows/ci.yml` runs lint, build, test on every push and PR. All three must pass before merge.
- CodeRabbit comments on every PR ([.coderabbit.yaml](./.coderabbit.yaml) configures it). Its comments are **advisory** — no `request_changes_workflow`. Treat findings as signal but the merge gate is CI.
- The Docstring Coverage pre-merge check is disabled because the project rule is "default to writing no comments."

### Squash-merge convention
Phase 0A and the commit-discipline PRs were squash-merged so the granular branch commits collapse into one main-branch commit. Use the same approach for future PRs unless there's a reason to preserve interim history. `gh pr merge <N> --squash --subject "<conventional subject>"`.

### Don't introduce
- TypeScript migration as a side effect (planned later phase)
- Tailwind, CSS-in-JS, styled-components, design system swaps
- Storybook, backend, database — see ROADMAP.md for phase boundaries
- New runtime dependencies without justification in the PR
