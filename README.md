# Citybase — The Model Shop

Your repository is a little town on a workbench. Folders become neighborhoods, files become buildings, and local coding agents become a crew you can send to work.

Citybase is a **playable local Electron app**. Wander the model with Pip, inspect real files, assign a crew member to a building, and watch actual Claude or Codex activity arrive as work-order notes. The first shift teaches the game before asking you to build anything.

## Open the shop

```sh
npm ci
npm run build
npm run start:desktop
```

Choose a local Git repository with **Open your first city**. Citybase remembers the repository between launches. To switch cities, click the repository name at the top. The title block and footer identify the actual local workspace.

For development with hot reload:

```sh
npm run dev:desktop
```

Node 22.12+ is recommended for the existing Vite/Electron toolchain. Git is required. A locally installed, authenticated Claude Code or Codex CLI is required for crew jobs; exploring files does not require either. Fonts ship locally. There is no hosted backend, standalone browser stub, or silently simulated agent execution.

## Your first shift

1. **Walk Pip.** Select the walking tool. Use WASD or arrow keys to move, Space to hop, or click the ground to travel. Visit a neighborhood to mark a discovery.
2. **Open a real file.** Click a building. Its paper inspector shows the file on your computer and its current changes against Git HEAD. The Atlas also supports keyboard navigation and search with ⌘/Ctrl K.
3. **Choose your crew.** Juniper uses Claude; Mica uses Codex. Click a crew token, then a building to assign a Survey job there. Unavailable providers are visibly disabled.
4. **Stamp a finished job.** Read the crew’s real output, then stamp the verified work order to record skill points. The first suggested follow-up creates an interactive campfire HTML file in your repository.

Drag the model to orbit, scroll to zoom, and use **H** to return to the overview. The scenic-route tool rotates the model; the lamp/daylight tool changes the light. Discovery sounds are optional. Reduced-motion preferences disable ambient motion. The Atlas remains usable when WebGL is unavailable.

## Jobs and skills

| Skill | What the crew does | Reward condition |
|---|---|---|
| Surveying | Read files and return a field report | Successful process plus actual assistant output |
| Crafting | Build something in the selected project | Successful process plus changed repository fingerprint |
| Mending | Work on a requested repair | Successful process plus changed repository fingerprint |

Survey jobs earn 40 XP; Crafting and Mending earn 60 XP. Every 100 XP raises the crew’s overall level; every 100 XP in a skill raises that skill’s level. Receipts are saved per repository and run ID, so stamping twice cannot grant duplicate rewards.

**These are game records.** Levels describe the crew’s history in this shop; they do not train or improve the underlying models. A verified crafting outcome proves that repository state changed during a successful job. It does not prove correctness or exclusive agent authorship. Bounded proof withholds rewards when files are too large, unreadable, unchanged, or the job fails. See [runtime details](docs/runtime-findings.md).

## Real work, local boundaries

The renderer has no Node or shell access. Electron’s main process resolves remembered workspace IDs, spawns the installed provider with argument arrays, and streams real process output through an isolated preload bridge. Work orders require approval before dispatch; recall terminates the child process.

Survey uses Codex’s read-only sandbox or Claude’s restricted read tools. Craft/Mend can change files in the selected working tree after approval. **Citybase does not create a worktree or a branch for each job.** Use a separate Git branch/worktree yourself when you want that isolation.

Building inspection rejects traversal, symlink escapes, Git internals and non-regular files. Text previews are limited to 128 KiB and diffs to 256 KiB. Reading changes never stages or resets the index. A diff is the current workspace against HEAD, not a historical per-agent diff.

The skyline shows up to 64 representative files per neighborhood; every file remains searchable in the Atlas. Very large repositories can exceed the comfortable scale of this prototype. Run history is bounded to 100 records, with 60 compact events per record. Older records without workspace identity are not mixed into another city’s ledger.

## Checks and screenshots

```sh
npm run lint
npm test -- --run --maxWorkers=1 --testTimeout=30000
npm run build
npm run test:e2e
```

Playwright launches real Electron in isolated profiles. Its fixtures test opening Git repositories, source/diff inspection, staged and unstaged changes, file refresh, workspace restoration, agent approval, streaming, recall, persistent history and skill receipts. The deterministic test provider is explicitly labeled in the fixture; authenticated Codex was also checked separately against disposable repositories.

To capture the **real current repository** with an isolated desktop profile:

```sh
npm run build
node scripts/capture-city.mjs
# Or keep the real desktop preview open:
node scripts/capture-city.mjs --keep-open
```

Local evidence is written to the ignored `artifacts/` directory. `CITYBASE_CAPTURE_WORKSPACE` can point the capture script at a different real Git repository. No screenshot assets or fabricated data are used to render the playable city.

## Where things live

- `src/App.jsx`: world state, first shift, crew assignment and reward collection.
- `src/city/`: procedural Three.js scene, repository layout, paper UI, guild progression.
- `src/app/`: workspace, agent-detection, event and approval hooks.
- `electron/main/services/`: guarded Git/workspace services and bounded file inspection.
- `electron/main/agents/`: Claude/Codex adapters, stream lifecycle, persistence and quest outcome proof.
- `e2e/`: isolated Electron journeys and sandbox checks.

The older project roadmap and legacy view components remain available for reference. The new slice focuses on play and real local work; a conventional editor, branch/commit/PR UI, full historical diffs, automatic agent isolation and production packaging are future work. Local builds are unsigned and are not a distribution release.

The model-shop art direction was refined using a read-only critique from Claude Fable 5.1; Fable also authored the final Electron icon wiring. The app includes a matching SVG/PNG icon, favicon and native macOS ICNS asset. Three.js is the one new runtime dependency, selected for actual geometry, lighting, camera control and efficient instancing—not a stack migration.
