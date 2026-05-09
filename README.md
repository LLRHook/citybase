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

```
src/
  App.jsx           — top-level shell (view switching + state)
  main.jsx          — Vite entry point
  data/
    seed.js         — single source of truth for all mock data (the backend will replace this)
  game/
    *.jsx, *.js     — UI components (city map, kanban, analysis, panels, modals)
    data.js         — re-export shim for legacy import paths (sources from src/data/seed.js)
    sagas.js        — re-export shim for legacy import paths (sources from src/data/seed.js)
  tests/
    setup.js
    *.smoke.test.jsx
docs/
  domain-model.md   — plain-language description of the core entities
  agent-runtime.md  — provider-neutral agent runtime contract
```

## Roadmap

The full vision and phased plan live in [ROADMAP.md](./ROADMAP.md). Phase 0A (this work) is a carve-out of Phase 0 focused on stabilization before real-data work begins.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md). The short version: AI agents propose changes via PRs; CI gates the merge.
