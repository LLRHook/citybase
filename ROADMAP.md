# Citybase Desktop - Roadmap

Citybase is a downloadable desktop code editor shell with a game-like visual interface. The HTML/React prototype is the visual reference, not the final runtime target.

The product is not a cloud SaaS agent platform and not a replacement for Codex or Claude Code. It is a local-first UI layer over a single Git workspace and a pluggable AI agent harness. The user should be able to open the app, pick one software project, connect Git, choose an agent provider, and drive work through a visual city instead of staring at code by default.

## Status — v2.0 "The Living City" (current)

The visual city — the founding promise — is shipped as the default view, projected
from real Git state and fused with live agent runs (buildings light up as the agent
edits). This is the v2.0 milestone. See [CHANGELOG.md](./CHANGELOG.md) (FEAT-013 →
FEAT-018) and [features.md](./features.md) for the work; the open backlog
(approval-boundary wiring BUG-004, design-system depth, run persistence) continues
from here.

## Product Boundary

Citybase v1 should do these things well:

- Run as an installed desktop application on macOS first, with Windows and Linux kept in mind.
- Open one local Git repository at a time.
- Read branch, status, file tree, commit history, and recent changes from Git.
- Render the repository as the city: folders are districts, files are buildings, project state is visual.
- Connect to a local agent harness through adapters. The first adapters should target Codex CLI and Claude Code.
- Send simple work requests to the selected agent and stream progress back into the UI.
- Hide source code by default. Users see visual status, summaries, changed areas, confidence, risks, and outcomes.
- Keep explicit approval boundaries before any agent changes files, runs commands, commits, or pushes.

Citybase v1 should not do these things yet:

- Host team SaaS accounts.
- Require Jira, Bitbucket, GitHub, or any remote issue tracker.
- Run its own cloud sandboxes.
- Pretend to be the coding agent.
- Display raw code diffs as the primary experience.
- Manage multiple repos at once.
- Build a plugin marketplace or custom agent framework.

## Demoable v1 Sentence

"I open Citybase, choose a local Git repository, see the project as a city, connect Codex or Claude Code, ask for one task, watch the agent work through visual progress, review a no-code summary of what changed, then approve or reject the result."

## Recommended Stack Direction

The current prototype should stay React + Vite while we build the real app shell around it.

Preferred v0.3/v1 path:

- Desktop shell: Electron for the first real app slice.
- Frontend: React + TypeScript + Vite.
- Local bridge: Electron main process with typed IPC.
- Git integration: start by shelling out to the user's installed `git` binary, then add a Git library only if needed.
- Agent integration: adapter interface over local CLIs first, with Codex CLI and Claude Code as the initial targets.
- Process streaming: run agent commands in the desktop main process, stream structured events to the renderer.
- State: local project/session store in the app data directory, plus in-memory UI state while the prototype matures.
- Packaging: app bundles for macOS first; Windows/Linux after the bridge works.

Tauri remains a good later option if bundle size and native hardening matter more than fastest integration. Electron is the pragmatic first choice because this project needs reliable child processes, local CLI orchestration, IPC, and packaging quickly.

## Architecture Sketch

```text
Citybase Desktop App

React/Vite renderer
  - city map
  - quest board
  - visual analysis
  - action controls
  - settings

Typed IPC boundary
  - never expose arbitrary shell access to the renderer
  - every command has an explicit allow-list and approval state

Desktop main process
  - workspace picker
  - Git service
  - agent adapter manager
  - process runner
  - event normalizer
  - local session store

Local tools
  - git
  - codex
  - claude
```

## Adapter Contract

The UI should not know whether Codex or Claude Code is running. It should talk to a small provider-neutral contract:

```ts
type AgentProvider = "codex" | "claude";

type AgentRequest = {
  workspacePath: string;
  provider: AgentProvider;
  prompt: string;
  mode: "plan" | "edit" | "review" | "test";
  approvalMode: "ask" | "read-only" | "workspace-write";
};

type AgentEvent =
  | { type: "started"; runId: string }
  | { type: "status"; label: string; detail?: string }
  | { type: "changed-area"; path: string; changeKind: "added" | "modified" | "deleted" }
  | { type: "needs-approval"; action: string; reason: string }
  | { type: "completed"; summary: string }
  | { type: "failed"; message: string };
```

Raw terminal output can be retained in logs for debugging, but the main app experience should translate it into game-state events.

## Phase 0A - Stabilization (complete)

**Goal.** Carve a small, low-risk slice out of Phase 0 so the prototype has a documented, tested, CI-backed shell before any real-data work begins.

**Landed.** Foundation merged across [PR #1](https://github.com/LLRHook/citybase/pull/1), [#6](https://github.com/LLRHook/citybase/pull/6), [#7](https://github.com/LLRHook/citybase/pull/7), [#8](https://github.com/LLRHook/citybase/pull/8); commits squash-merged into `main`.

- [x] Repo spine: [README](./README.md), [AGENTS.md](./AGENTS.md), [CONTRIBUTING.md](./CONTRIBUTING.md), [CLAUDE.md](./CLAUDE.md), `.github/pull_request_template.md`, `.github/dependabot.yml`.
- [x] CI: [.github/workflows/ci.yml](./.github/workflows/ci.yml) runs `install -> lint -> build -> test`, least-privilege token, SHA-pinned actions, `pull_request` trigger only.
- [x] Mock data centralized in [src/data/seed.js](./src/data/seed.js); `src/game/data.js` and `sagas.js` are thin re-export shims so component imports keep working.
- [x] Component split for Fast Refresh: [palette.js](./src/game/palette.js), [hex.js](./src/game/hex.js), [useTweaks.js](./src/game/useTweaks.js); [theme.jsx](./src/game/theme.jsx) is components-only.
- [x] Tests: Vitest + React Testing Library + jsdom wired; smoke tests against `<App />` cover render and seed-data flow.
- [x] Lint zero-error: `react-refresh/only-export-components` at error severity, no `react-hooks/refs` violations, no unused `React` imports.
- [x] Domain model + agent-runtime contract: [docs/domain-model.md](./docs/domain-model.md), [docs/agent-runtime.md](./docs/agent-runtime.md).
- [x] Commit discipline: [hooks/commit-msg](./hooks/commit-msg) canonical validator + [.claude/hooks/validate-commit-msg.sh](./.claude/hooks/validate-commit-msg.sh) PreToolUse wrapper.
- [x] AI review wired: [.coderabbit.yaml](./.coderabbit.yaml) in advisory mode.
- [x] Claude Code project setup: [.claude/settings.json](./.claude/settings.json) with permissions allowlist + PreToolUse hook.

## Phase 0 - Reframe The Prototype

Goal: make the current prototype clearly describe the desktop app we are building.

Definition of done:

- README says Citybase is a desktop app, not a website.
- Roadmap says v1 is local Git + agent harness, not Jira/Bitbucket SaaS.
- UI copy stops implying a live Bitbucket/Jira connection.
- Analysis view is redesigned conceptually as visual results instead of code diffs.
- Lint/build status is known and tracked.

## Phase 1 - Desktop Shell

Goal: wrap the current visual prototype in a real downloadable app shell.

Definition of done:

- Electron app opens the existing React UI.
- App can be launched from the OS like a normal desktop app.
- Basic app menu exists: Open Workspace, Settings, Quit.
- Workspace path is stored locally and restored on restart.
- No web server is required for normal app use.

Work items:

- Add Electron main/preload processes.
- Keep renderer isolated from Node APIs.
- Add a typed IPC helper.
- Add packaging script for macOS development builds.
- Add a "desktop mode" smoke test that opens the app window.

## Phase 2 - Local Git Connection

Goal: connect the city to the selected repository.

Definition of done:

- User picks a local folder.
- App verifies it is a Git repository.
- Top bar shows real repo name, branch, and dirty/clean state.
- City districts are generated from the real folder tree.
- Activity feed shows recent commits and working-tree changes.

Work items:

- Implement Git service in the desktop main process.
- Add workspace picker and repo validation.
- Build a pure `repoTree -> cityModel` projector.
- Replace static `REPO`, `DISTRICTS`, and `BUILDINGS` fixtures for the connected path.
- Add empty states for no workspace, invalid repo, and missing Git.

## Phase 3 - Agent Harness Basics

Goal: call Codex CLI or Claude Code from the desktop app without building a new agent.

Definition of done:

- Settings screen detects installed `codex` and `claude` binaries.
- User can select provider per workspace.
- A simple request can be sent to the selected provider.
- The UI receives progress events and completion/failure state.
- All file-changing modes require approval.

Work items:

- Create `AgentAdapter` interface.
- Implement `CodexCliAdapter`.
- Implement `ClaudeCodeAdapter`.
- Normalize stdout/stderr into `AgentEvent` values.
- Store runs locally with timestamps, provider, prompt, and final result.
- Add failure states for missing binary, auth needed, cancelled run, and timeout.

## Phase 4 - No-Code Work Review

Goal: make the result screen match the product promise: visual first, no raw source by default.

Definition of done:

- Analysis screen no longer renders raw code hunks as the primary view.
- Changed files are shown as affected buildings/districts.
- Results summarize intent, areas changed, tests/checks run, risk level, and next action.
- A raw log/debug drawer exists only for advanced troubleshooting.

Work items:

- Replace "Code Changes" with "Changed Districts" and "Outcome".
- Add a visual diff summary: files changed, change type, risk, confidence.
- Add approve/reject/continue controls.
- Preserve enough hidden run data for debugging.

## Phase 5 - Basic Editor Workflows (complete)

Goal: make Citybase useful for a single developer on one project.

**Landed.** Five slices on `main`: [#29](https://github.com/LLRHook/citybase/pull/29), [#31](https://github.com/LLRHook/citybase/pull/31), [#34](https://github.com/LLRHook/citybase/pull/34), [#35](https://github.com/LLRHook/citybase/pull/35), [#38](https://github.com/LLRHook/citybase/pull/38).

Definition of done:

- [x] Open workspace.
- [x] See Git state.
- [x] Run an agent task.
- [x] Review visual result.
- [x] Run tests or lint through approved actions.
- [x] Commit through an explicit Git action when the user is ready.

Work items:

- [x] Branch selector/status — slice 1.
- [x] Staged/unstaged visual state — slice 2.
- [x] "Run checks" action — slice 3.
- [x] "Commit result" action with editable message + branch checkout — slice 4.
- [x] Local run history (real, no seed/mock data) — slice 5.

## v1 Ship Gate

Citybase v1 ships when every item is true:

- Installed desktop app launches without a dev server.
- **App auto-boots on launch:** the most recent workspace is restored when one exists, agent detection runs, and the user lands in a usable state without intermediate clicks. First-run users see the unlinked shell and a single 'Open Workspace' affordance.
- User can open one local Git repository.
- City view is generated from the real repository.
- Git status, branch, and recent changes are real.
- **Claude Code adapter** is available when the `claude` CLI is installed and is the default first-run provider. The Codex adapter ships in v1 as well but is not a hard ship requirement — `claude` not installed surfaces a clear settings prompt; v1 does not block on either being present.
- A read-only agent request and a write-capable approved request both work end to end against Claude Code.
- The default review surface does not show raw code.
- App handles missing Git, missing agents, auth failures, and cancelled runs cleanly.
- Build, lint, typecheck, and smoke tests are green.
- README includes setup, app architecture, safety model, and troubleshooting.

### Status (post Phase 5)

The structural plumbing for the v1 ship gate is in place. Each gate item below is annotated with the PR(s) that addressed it; items without a PR reference still need work.

- ✅ **Claude Code adapter functional end-to-end against the real `claude` CLI.** The adapter now uses the real flags (`--print --output-format json --model … --permission-mode bypassPermissions` + the prompt as a positional arg) and `streamEvents` yields real Claude output instead of a synthesized trail. [#36](https://github.com/LLRHook/citybase/pull/36).
- ✅ **App auto-boots on launch.** Main process pushes a one-shot boot payload over `BOOT_PAYLOAD_CHANNEL` once `did-finish-load` fires, carrying `{ detect, workspace }`. The renderer's `useAgentDetect` hook accepts the cached payload and skips the IPC roundtrip; `useWorkspace` restores the recent workspace via `getCurrentWorkspace`. No clicks needed before the city renders. [#37](https://github.com/LLRHook/citybase/pull/37).
- ✅ **Local run history is real.** `agentManager.listRuns()` surfaces every dispatched run from the in-memory history Map (cancel-survives, FIFO-bounded). The renderer's Run History panel renders rows for real runs and an explicit "no runs yet" empty state instead of seed data. [#38](https://github.com/LLRHook/citybase/pull/38).
- ⏭ **End-to-end manual verification on macOS / Windows packaged builds.** Local browser preview is blocked by Docker holding port 5173 throughout this session, so manual UX verification of the auto-boot flow has not happened in this loop.
- ⏭ **`openPR` via `gh` CLI.** `CliAgentAdapter.openPR` still throws the deferred placeholder. Without it, the "approved write-capable request" gate item only completes locally — the user still finishes in their normal Git tool, which is consistent with the deferred `push` item below but not with "PR creation as part of the run".
- ⏭ **Token-by-token streaming.** Currently `streamEvents` yields one event after the CLI exits because `processService` does not surface stdout chunks on a child handle. Real-time streaming is a follow-up.
- ⏭ **README updates** for setup, packaging, safety model, troubleshooting.

### Out of v1 scope (deferred to v1.1+)

- Codex CLI as a hard ship requirement (the adapter ships, but Codex is not part of the must-pass demo).
- Multi-workspace switching from inside a running app session (close + relaunch is fine for v1).
- Push-to-remote action (commit lands locally; the user finishes in their normal Git tool).
- Any remaining seed/mock data the renderer still imports (`EMPTY_*` stubs in `App.jsx`, `ADV_REPORTS` in `src/data/seed.js`). The renderer already ignores these in production paths thanks to slice 5's run-history surface, but the imports themselves should be deleted in a v1.1 cleanup.

## Open Questions

- Do we want macOS-only for the first downloadable build, or macOS + Windows from the start?
- ~~Should Codex or Claude Code be the default first-run provider when both are installed?~~ **Decided: Claude Code is the v1 default.**
- Should Citybase ever include a hidden code editor panel, or should raw code stay outside the main product permanently?
- ~~Should commit/push be v1, or should v1 stop at local changed files and let users finish in their normal Git tool?~~ **Decided: commit only; push deferred to v1.1.**
