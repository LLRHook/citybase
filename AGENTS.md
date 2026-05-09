# AGENTS.md — AI Agent Handbook

This document tells AI coding agents (Claude Code, Codex, Gemini, Aider, local models, anything else) how to work in this repo. Humans should read it too.

## What is Citybase?

Citybase is an isometric IDE that visualizes a repository as a hex-tile city. Tickets become quests, contributors become guilds, coding agents are the adventurers dispatched to fulfill quests. Phase 5 is complete — the renderer reads real Git state, dispatches real Claude Code runs, and renders real run history. See [ROADMAP.md](./ROADMAP.md) for the phased plan and remaining v1.1 work.

## Running the app

```bash
npm install
npm run dev          # dev server with HMR (http://localhost:5173)
npm run build        # production build
npm run lint         # ESLint
npm test -- --run    # Vitest, single pass
```

## Where seed / fixture data lives

**One canonical source:** `src/data/seed.js`. Production paths in the renderer no longer import it — the city is projected from real Git state, run history is read from `agentManager.listRuns()`, and the modals receive `districts` as a prop. seed.js stays as **test fixtures**: `AdventurerAnalysis.test.jsx` is the only consumer.

`src/game/data.js` is a slim shim that re-exports `SKILL_DEFS`, `hpFromContext`, and `fmtTokens` from seed — those are constant enums / pure formatters, not user data.

If you need new test fixtures, put them in `src/data/seed.js`. **Do not import seed.js from production renderer code.**

## Where state lives

All UI state currently lives in the `CodebaseCity` component in `src/App.jsx`. There is no external store yet — Zustand is planned for Phase 2 once the screen count grows.

Children receive state via props. Don't add new top-level `useState` outside `App.jsx` unless the state is genuinely component-local.

## Views

`src/App.jsx` switches between three views via a single `view` state value:

- `'city'` — isometric map (default)
- `'kanban'` — quest board lanes
- `'analysis'` — adventurer PR analysis

## The agent rule

> **AI agents propose changes via PRs. CI gates the merge.**

Do **not** push directly to `main`. Open a PR from a feature branch. Lint, build, and tests must be green before the PR can be merged. CI is in [.github/workflows/ci.yml](./.github/workflows/ci.yml).

## Commit messages

This project uses **conventional commits**, enforced by a `commit-msg` hook in [hooks/commit-msg](./hooks/commit-msg). Activated via `core.hooksPath` (set by `npm install` postinstall).

Subject format: `<type>(<scope>)?<!>?: <imperative description>`

Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `style`, `perf`, `build`, `revert`.

The hook will reject any commit whose subject doesn't match. A second layer — [.claude/hooks/validate-commit-msg.sh](./.claude/hooks/validate-commit-msg.sh), wired in [.claude/settings.json](./.claude/settings.json) — intercepts `git commit -m "..."` calls inside Claude Code sessions before they execute, so the failure surfaces immediately rather than after the bash call.

**A note on the global `/commit` skill.** The user's global Claude skill `commit` writes commit subjects as the literal branch name or a ticket ID, not as conventional commits. **Don't use `/commit` on this repo** — its output will be rejected by the hook. Use `git commit -m "<type>: ..."` directly, or invoke the project-specific orchestration skill once it exists.

## PR review

Every PR receives an automated review from [CodeRabbit](https://coderabbit.ai). Its comments are **advisory** — they do not block merge. CI is the merge gate. CodeRabbit's behavior is configured in [.coderabbit.yaml](./.coderabbit.yaml); adjust path instructions there rather than dismissing reviews case-by-case.

## Constraints (keep these in mind)

- **No new runtime dependencies** without justification in the PR. Dev deps for testing/tooling are fine.
- **No TypeScript migration** as a side effect. Files stay `.js`/`.jsx` until a deliberate migration phase.
- **No styling overhauls.** No Tailwind, no design-system swap, no Storybook setup yet.
- **No backend work yet.** No Postgres, Redis, Hono, tRPC, OAuth — that's Phase 1+.

## Domain model

See [docs/domain-model.md](./docs/domain-model.md) for plain-language definitions of: repo, district, building, quest, guild, adventurer, agent run.

## Agent runtime contract

The agent runner implements the provider-neutral `AgentProvider` interface in [docs/agent-runtime.md](./docs/agent-runtime.md). `ClaudeAdapter` is the v1 default and shells out to the real `claude --print --output-format json …` CLI. `CodexAdapter` is wired through the same shape. `CliAgentAdapter.openPR` shells out to `gh pr create` for the PR-creation surface — the head branch must be pushed first (auto-push is deferred to v1.1).

## Roadmap

Long-term plan and phase definitions live in [ROADMAP.md](./ROADMAP.md). Phase 0A through Phase 5 are complete; v1.1 cleanup and deferred items are tracked under "Status (post Phase 5)" and "Out of v1 scope".
