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

Follow the existing pattern:

```
type: short imperative summary

Optional body explaining why, not what.
```

Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`.

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
