# Codebase City

> An isometric IDE that visualizes a repository as a hex-tile city, where Bitbucket/Jira tickets become quests, contributors are guilds, and coding agents are the adventurers dispatched to fulfill them.

## What is this?

Codebase City (Citybase) is currently a **design prototype** — UI only, all data mocked. The repo is being shaped into a real, runnable IDE in phases; see [ROADMAP.md](./ROADMAP.md) for the full plan.

This branch represents **Phase 0A — Foundation**: the prototype has been wrapped in CI, tests, docs, and a centralized mock-data module, so future feature work has somewhere obvious to land.

## Quick start

Prerequisites: Node 20+ and npm.

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | ESLint over the project |
| `npm test` | Run Vitest in watch mode (use `npm test -- --run` to run once and exit) |
| `npm run preview` | Preview the production build locally |

## Project structure

```text
src/
  App.jsx                       — top-level shell (view switching + state)
  main.jsx                      — Vite entry point
  data/
    seed.js                     — single mock data source; the backend will replace this
  game/
    palette.js                  — neon color tokens + alpha helper
    hex.js                      — pointy-top hex grid math (HEX_SIZE, hexToPx, hexPath)
    theme.jsx                   — UI primitives (Panel, NeonBar, Pill, Title, NButton, Crest, IsoBuilding)
    useTweaks.js                — runtime-toggles hook
    map.jsx, kanban.jsx,
    analysis.jsx, panels.jsx,
    modals.jsx, command.jsx,
    tweaks.jsx                  — view + panel components
    data.js, sagas.js           — re-export shims sourcing from src/data/seed.js (back-compat)
  tests/
    setup.js                    — Vitest setup (jest-dom + matchMedia shim)
    *.smoke.test.jsx            — RTL smoke tests against <App />

docs/
  domain-model.md               — plain-language description of the core entities
  agent-runtime.md              — provider-neutral AgentProvider contract

hooks/
  commit-msg                    — canonical conventional-commit validator (activated via npm postinstall)

.github/
  workflows/ci.yml              — install → lint → build → test, SHA-pinned actions
  dependabot.yml                — weekly bumps for npm + github-actions
  pull_request_template.md

.claude/
  settings.json                 — project-level permissions + PreToolUse commit-msg hook
  hooks/validate-commit-msg.sh  — Bash wrapper that delegates to hooks/commit-msg

CLAUDE.md                       — Claude Code entry point (thin pointer to AGENTS.md)
AGENTS.md                       — provider-neutral handbook for any AI agent
CONTRIBUTING.md                 — PR workflow + commit format the hook enforces
ROADMAP.md                      — phased plan; Phase 0A foundation complete
.coderabbit.yaml                — advisory AI review (chill profile, advisory mode)
.gitattributes                  — forces LF on shell scripts (Windows + Git Bash)
```

## Roadmap

The full vision and phased plan live in [ROADMAP.md](./ROADMAP.md). Phase 0A (this work) is a carve-out of Phase 0 focused on stabilization before real-data work begins.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md). The short version: AI agents propose changes via PRs; CI gates the merge.
