# Contributing

Thanks for working on Citybase. This file covers how PRs are opened, what CI checks must pass, and what's currently out of scope.

## Workflow

1. Branch from `main`. Use a descriptive name (`phase-0a-foundation`, `fix/timeline-flake`, `feat/jira-adapter`, etc.).
2. Make focused commits — one concern per commit when practical.
3. Open a PR. Fill in the PR template ([.github/pull_request_template.md](./.github/pull_request_template.md)).
4. Wait for CI to go green. Do not merge red PRs.

## CI must pass

Every PR runs:

```bash
npm ci
npm run lint
npm run build
npm test -- --run
```

All four must succeed. CI definition is in [.github/workflows/ci.yml](./.github/workflows/ci.yml).

If a check fails because of a flaky test or environmental issue, fix the root cause — don't disable the check.

## Commit messages

This project enforces **conventional commits** via the [hooks/commit-msg](./hooks/commit-msg) script. The hook is activated automatically when you run `npm install` (which sets `git config core.hooksPath hooks` via the postinstall script).

### Format

```text
<type>(<scope>)?<!>?: <imperative description>

Optional body explaining why, not what.
```

### Rules (enforced by the hook)

- **Type prefix is required.** Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `style`, `perf`, `build`, `revert`.
- **Description starts with a lowercase letter** and does **not** end with `.` `!` or `?`.
- **Subject must be 72 characters or fewer**, including the type prefix.
- **Scope is optional and lowercase** — e.g. `fix(lint): drop unused imports`.
- **Breaking-change marker `!` is optional** — e.g. `feat!: drop legacy data shim`.

### Examples

```text
feat: add agent-runtime adapter contract
fix(lint): drop unused React imports
refactor: centralize mock data into src/data/seed.js
ci: wire CodeRabbit review config
docs: add domain-model and agent-runtime
test: add App and QuestBoard smoke tests
```

### Inside Claude Code

A second layer — [.claude/hooks/validate-commit-msg.sh](./.claude/hooks/validate-commit-msg.sh) — runs as a `PreToolUse` hook on `Bash`. It intercepts `git commit -m "..."` calls inside the session before they execute, so a malformed subject is rejected immediately rather than after the commit attempt.

**Don't use the global `/commit` skill on this repo** — its output (branch name as subject) will be rejected by the hook. Use `git commit -m "<type>: ..."` directly.

## Code style

- Match the patterns already in [src/game/](./src/game/).
- Inline styles are fine for now (the design system is built with `Panel`, `NeonBar`, `Title`, etc. in `theme.jsx`).
- Don't introduce CSS-in-JS libraries, Tailwind, or styled-components in this phase.
- Prefer functional React with hooks; no class components.

## Testing

- New behavior gets a test if it's feasibly testable in jsdom.
- Tests live in `src/tests/`.
- Use Vitest + React Testing Library. See existing smoke tests for the pattern.

## What's out of scope right now

- TypeScript migration (planned later; don't migrate files as a side effect).
- New runtime dependencies (require justification in the PR description).
- Visual / styling overhauls.
- Backend, database, hosting, real Jira/Bitbucket integration — see [ROADMAP.md](./ROADMAP.md) for phase boundaries.

## AI-generated PRs

AI agents are welcome contributors. They follow the same rules as humans:

- One feature branch per PR.
- CI must be green.
- The PR description should describe the change in human terms, not just the diff.

See [AGENTS.md](./AGENTS.md) for the full agent handbook.
