# Codebase City — Roadmap

> An isometric IDE that visualizes a repository as a hex-tile city, where Bitbucket/Jira tickets become quests, contributors are guilds, and coding agents are the adventurers dispatched to fulfill them.

The current `main` is a faithful port of the design prototype — UI only, all data mocked. This document is the plan to take it from prototype to a real, runnable IDE.

---

## North-Star End Goals

The product is "shipped" when **all** of the following are true:

1. **Connect a real repo.** A user signs in, links a Bitbucket (or GitHub) repository, and the city renders that repo's actual folder/file tree as districts and buildings.
2. **Quests are real tickets.** The Quest Board, Kanban view, and Saga groupings are populated from live Jira projects (and/or Bitbucket issues) with two-way status sync.
3. **Guilds reflect real contributors.** Authors detected from commit history become guilds; the user's coding agents (configured per-account) are the adventurers under them.
4. **Dispatching an adventurer runs a real coding agent** in a sandboxed workspace, against a real branch, with the reasoning trail and diffs streamed live into the Analysis view.
5. **A successful quest opens a real PR** on the remote, with the agent's diff, generated description, and CI hooked into the PR's checks.
6. **HP = live context.** A dispatched agent's HP bar reflects its actual current/max token usage; "Rest Camp" compacts or resets the conversation, restoring HP.
7. **Roles are enforced.** Admin / Member / Viewer permissions gate posting quests, dispatching agents, and approving PRs — backed by the user's actual role on the remote.
8. **It is operable for one team.** A small team (≤10 people) can run a real day of work through the city without falling back to Jira / Bitbucket directly for the core flow.

A demoable v1 sentence:

> *"I open the city, point it at my repo, post a Jira ticket as a quest, click an open quest, dispatch Alpha-7 from my guild, and within ten minutes a real PR appears against my branch with the agent's reasoning trail viewable in the Analysis screen."*

---

## Working Assumptions (decide-for-me defaults)

These are the assumed answers to the spec questions. Each is overridable; this is the default until the user says otherwise.

| Decision | Default |
|---|---|
| Form factor | Web app (cloud-hosted), runs in the browser, server-side agent runners |
| Source of truth | Bitbucket Cloud (primary). GitHub adapter behind the same interface in v1.5. |
| Issue tracker | Jira Cloud |
| Agent runtime | Claude Agent SDK (Sonnet/Opus), pluggable adapter for OpenAI later |
| Sandbox | Ephemeral remote container per quest (Modal / E2B / Daytona — TBD) |
| Workspace mode | Each quest gets its own checkout + branch; merges via PR only |
| Auth | Atlassian OAuth 2.0 (Bitbucket + Jira), GitHub OAuth as second-class |
| Server | Node + Hono (or Express), tRPC for typed client/server contracts |
| DB | Postgres via Drizzle (or Prisma); Redis for live state / pub-sub |
| Realtime | Server-sent events for the activity feed + agent stream; WebSocket if SSE doesn't fit |
| Hosting | Fly.io or Railway; Cloudflare in front of static |
| TS migration | Convert to TypeScript before adding networking (Phase 2 entry) |
| State mgmt | Zustand once we cross ~5 stateful screens |
| Skill set | Bug Fix · Refactor · Add Tests · Code Review · Lint Pass · Docs (all six, v1) |
| Permissions | citybase-local role table, seeded from remote role on link |
| Cost cap | Per-user daily token + sandbox-minute budget, hard halt at limit |
| Fidelity | Keep current animations; add `prefers-reduced-motion` opt-out |
| Mobile | Read-only responsive view in v2; v1 is desktop-only |

---

## Architecture Sketch

```
                       ┌───────────────────────────────────┐
                       │        Web client (this repo)      │
                       │  React + Vite + Zustand + tRPC     │
                       └──────────────┬────────────────────┘
                                      │
                          tRPC over HTTPS / SSE
                                      │
┌──────────────────────────────────────┴────────────────────────────────┐
│                                  API                                    │
│   Node + Hono + tRPC                                                    │
│   ──────────────────────────────────────────────────────────────────    │
│   • auth (Atlassian/GitHub OAuth, sessions)                             │
│   • repo service (Bitbucket/GitHub adapters, tree → city projector)     │
│   • issue service (Jira/Bitbucket adapters, ticket ⇄ quest sync)        │
│   • guild service (contributors → guilds, agent CRUD)                   │
│   • quest service (post/accept/dispatch/complete, lane transitions)     │
│   • agent orchestrator (Claude Agent SDK runner per quest)              │
│   • sandbox broker (provision container, mount checkout, stream logs)   │
│   • PR service (open/update PR on Bitbucket/GitHub)                     │
│   • events bus (SSE topics: agent.tick, quest.update, activity)         │
└──────────┬──────────────────────────────────┬──────────────────────────┘
           │                                  │
           ▼                                  ▼
   Postgres (state, audit log)        Redis (live agent streams, pub-sub)
                                              │
                                              ▼
                                     Sandbox provider
                                  (Modal / E2B / Daytona)
                                  one ephemeral container per active quest
```

---

## Phased Plan

Each phase has a **goal**, a **definition of done**, and **work items** that map to issues. Phases are sequential — don't start Phase 2 until Phase 1's DoD is green.

### Phase 0 · Foundation (where we are now → ready for backend)
**Goal.** Lock the prototype into a maintainable shape so backend work can start without churn.

**DoD.** TypeScript + lint + CI green; mocked data sourced from a single seed file the backend will eventually replace; Storybook (or equivalent) renders every city/kanban/analysis component in isolation.

- [ ] Convert `src/game/*.jsx → *.tsx` and `*.js → *.ts`; add `tsconfig.json` with strict mode.
- [ ] Add ESLint + Prettier config (already partially present), wire `npm run lint` + `npm run typecheck` into CI.
- [ ] Add GitHub Actions: `ci.yml` runs install → typecheck → lint → build on every push.
- [ ] Extract all state into a single `useGameStore` (Zustand) so future server data has one home.
- [ ] Replace inline `style={{}}` blocks with CSS-in-JS or CSS modules where they exceed ~30 lines, for diffability.
- [ ] Add `vitest` + React Testing Library; smoke test that the three views render.
- [ ] Add a simple keyboard-shortcut layer (`L`/`T`/`R`/`P`/`D`/`O` action hotkeys, `1`/`2`/`3` view switch) — currently buttons only.
- [ ] Storybook (or Ladle) for: `Panel`, `NeonBar`, `IsoBuilding`, `QuestCard`, `KanbanCard`, `WorkerAgentCell`, `SelectedUnitCard`, `RiskMeter`.

### Phase 1 · Real repo as data
**Goal.** Replace `data.ts` with a live projection of an actual Bitbucket repo.

**DoD.** A signed-in user can paste a Bitbucket repo URL and see the city render with that repo's real top-level folders as districts and real files as buildings; refresh re-fetches.

- [ ] **Backend skeleton.** Stand up Node + Hono + tRPC + Drizzle + Postgres locally; Dockerfile + `docker-compose.yml`.
- [ ] **Atlassian OAuth.** `/auth/atlassian/start` and `/auth/atlassian/callback`; persist tokens server-side; client stores only a session cookie.
- [ ] **`bitbucket` adapter.** Implement `getTree(repo, ref)`, `getBranches(repo)`, `getCommits(repo, since)`, behind a `RepoProvider` interface so GitHub can drop in later.
- [ ] **City projector.** Pure function `tree → { districts, buildings }`. Top-level dirs → districts (color-cycled), files → buildings (`.tsx`/`.ts` → tower, `.json`/`.md`/etc. → house, dirs with many files → cluster).
- [ ] **Hex-coord auto-layout.** Place districts on a hex ring around `core` (root) using deterministic ordering by name length / file count to keep layout stable across refetches.
- [ ] **Cache layer.** 5-minute TTL on repo trees; invalidate on push webhooks once those exist.
- [ ] **Empty / unconnected states.** "Connect a Bitbucket workspace" splash when no repo is linked — replaces the current "NO REMOTE LINK" veil.
- [ ] **GitHub adapter** (parity with the Bitbucket adapter). Behind a feature flag.

### Phase 2 · Quests from real tickets
**Goal.** Quest Board, Kanban view, and Saga groupings are live Jira data.

**DoD.** Creating a Jira issue (or moving its status) in Jira shows up in the city within ≤ 10 s; "Post a Quest" creates a real Jira issue.

- [ ] **`jira` adapter.** `listIssues(filter)`, `createIssue(payload)`, `transitionIssue(id, to)`, `getProject(key)`, `linkIssue(from, to)`.
- [ ] **Quest sync service.** Two-way mapping: Jira issue type → quest skill (heuristic + override table); status → lane; epic → saga; story-points → quest.points; subtasks → errands.
- [ ] **Webhooks.** Receive Jira issue events; translate to events bus messages; SSE to the client.
- [ ] **Bitbucket issues adapter** as a fallback / alternative.
- [ ] **Saga model.** Persist `sagas` table; map Jira epics ↔ sagas; allow user override of saga title/color/icon.
- [ ] **Filters & search.** Quest Board gains: by skill, by district, by guild, by saga, full-text — replacing today's open/active/done only.
- [ ] **Idempotent post.** "Post a Quest" with a client-generated UUID so refresh doesn't double-post.
- [ ] **Conflict handling.** If Jira and citybase disagree on lane (e.g. someone moved the ticket in Jira mid-dispatch), surface a "drift" badge on the card.

### Phase 3 · Guilds & adventurers
**Goal.** Real contributors as guilds; users can configure their own coding agents.

**DoD.** Guild Roster reflects the repo's actual authors; each user can add / remove / configure their adventurers; HP/MP/level/XP persist across sessions.

- [ ] **Author detection.** From `getCommits`, derive distinct authors (name + email/handle); upsert as guilds; commit count → guild XP / level proxy.
- [ ] **Guild editing.** Crest letter, color, display name overridable by an admin.
- [ ] **Adventurer CRUD.** Per-user UI to add an adventurer: name, class, base prompt, allowed skills, model (`claude-opus-4-7` / `claude-sonnet-4-6` / `claude-haiku-4-5`), `maxContext`, tool allow-list.
- [ ] **Persistence schema.** `guilds`, `adventurers`, `adventurer_state` (xp, contextUsed, status, last_quest).
- [ ] **Skill graph (lite).** A skill = `{ id, prompt_template, tool_allowlist, model_default }`. Six built-in skills shipped in v1; "Skill Forge" node editor pushed to v2.
- [ ] **Recruitment.** "Spawn Agent" / "Recruit Hunter" Production-tab actions wired to the adventurer creation flow (gated by guild XP cost).

### Phase 4 · Dispatch & sandbox
**Goal.** Clicking "Accept Quest → dispatch Alpha-7" launches a real coding agent in a sandbox against a real branch.

**DoD.** A dispatched agent: (a) checks out a fresh branch, (b) runs the skill prompt with tools, (c) streams its reasoning into the Analysis view live, (d) exits cleanly on success or timeout, (e) leaves diffs ready for PR.

- [ ] **Sandbox broker.** `acquire({ repo, ref, advId, questId })` returns a container handle; `streamLogs(handle)` returns an event stream; `release(handle)` tears down.
- [ ] **Pick a provider.** Spike Modal vs E2B vs Daytona; pick on cold-start latency, max wall-clock, $/min, and disk size. Document in `/docs/sandbox-decision.md`.
- [ ] **Workspace prep.** Inside the sandbox: `git clone --depth=20`, `git checkout -b agent/{questId}-{advId}`; install deps if cached, otherwise warm-cache lock-file.
- [ ] **Agent runner.** Wrap Claude Agent SDK; expose tools: `read_file`, `edit_file`, `run_shell` (allow-listed), `run_tests`, `git_commit`, `open_pr`.
- [ ] **Reasoning trail recorder.** Each agent step (plan/edit/test/lint/pr) persisted as a row; streamed to the client; rendered in the existing Analysis `ReasoningTrail`.
- [ ] **Live HP.** `contextUsed` updated after every model call; selected unit card + worker agent cell HP bars driven by it.
- [ ] **Pawn animation.** Activate the existing hex-pawn motion when a quest enters `dispatched`/`active`; freeze when paused.
- [ ] **Hard limits.** Per-quest: max wall-clock (default 15 min), max tokens, max sandbox spend; halt-and-fail with a clear toast.
- [ ] **Failure / retreat state.** If the agent exits non-zero or hits a limit, lane transitions to `blocked` with a `failed` badge and a re-dispatch option.

### Phase 5 · PR + review loop
**Goal.** Successful quests produce real PRs; the Analysis view becomes the review surface.

**DoD.** A finished agent run pushes its branch and opens a PR on the remote; the PR's checks (CI, lint, typecheck) appear in `CheckRow`; reviewers' approve/request actions sync back.

- [ ] **PR open.** `bitbucket.openPullRequest({ source, dest, title, body })` with the agent's commit history + reasoning trail rendered into the PR body.
- [ ] **PR sync.** Webhook → update `quest.lane` to `in-review` / `done`; refresh additions/deletions/files; pull check statuses.
- [ ] **Reviewer actions.** "Approve" / "Request changes" buttons in the Analysis view call the adapter's review endpoint.
- [ ] **Comments thread.** Two-way: PR comments → analysis comments; replies posted from the city are pushed to the PR.
- [ ] **Code-review skill.** Dispatching a `review` quest runs an agent that posts review comments instead of opening a PR.

### Phase 6 · Real metrics + observability
**Goal.** The dashboards stop lying. Vitals, sparklines, alerts, and objectives are computed from real data.

**DoD.** Build Health = latest CI pipeline status; Coverage = latest coverage artifact; Open Quests / Active = live counts; Alerts populated from real lint/complexity/flake signals.

- [ ] **Metrics ingest.** Adapters for Bitbucket Pipelines / GitHub Actions to fetch latest run + duration + status.
- [ ] **Coverage / complexity.** Parse coverage reports if uploaded; otherwise run a lightweight static-analysis pass in a sandbox on demand.
- [ ] **Sparklines.** Persist a daily metrics snapshot table; render last-7 from it.
- [ ] **Alerts engine.** Rules: cyclomatic complexity above threshold, flaky test detected (n failures in m runs), lint regressions vs main.
- [ ] **Objectives.** User-defined targets (coverage ≥ X%, open PRs ≤ Y, build green for N hours); evaluated server-side; checklist updates live.
- [ ] **Cost tracking.** Per-quest token + sandbox-minute spend; surfaced in the Activity Feed and a future "Treasury" panel.

### Phase 7 · Multi-user, permissions, polish
**Goal.** A team of up to ten people uses the same city without stepping on each other.

**DoD.** Sessions are per-user; roles enforced; presence visible; concurrent dispatches don't conflict; audit log visible to admins.

- [ ] **Sessions + role table.** `users`, `memberships(role: admin|member|viewer)`, seeded from remote roles on link.
- [ ] **RBAC middleware.** Server-side enforcement on every mutation; client hides controls but never trusts the toggle.
- [ ] **Presence.** Show other users' cursors (lightweight) on the city; selected unit "claimed by" indicator.
- [ ] **Concurrency.** Lock a quest while it's in dispatch; second dispatcher gets a clear error.
- [ ] **Audit log.** Every mutation persisted; admin-only "Chronicle" panel.
- [ ] **Notifications.** @-mentions in PR comments, quest assignments, build breakages.
- [ ] **Reduced-motion mode.** Honor `prefers-reduced-motion`; freeze pawns and pulses.
- [ ] **Mobile read-only.** Responsive layout for the City + Quest Board on phone-sized screens.

### Phase 8 · v2 candidates (post-launch backlog)
- Skill Forge — node-graph editor for composing custom skills.
- Boss-fight incident mode when prod breaks (raid party rallies on the broken district).
- Sprint planning ("Campaign") screen with capacity guardrails.
- Burndown / velocity dashboards.
- Retrospective ("Tavern") screen.
- World-map zoom-out for multi-repo orgs.
- Quest templates ("spell scrolls") — one-click "add a new component"-style scaffolds.
- Bulk actions on Kanban (multi-select → assign / move / close).
- Sandbox image marketplace (per-language, per-framework presets).

---

## Cross-cutting Workstreams

These run in parallel with the phase work above.

- **Security & threat model.** Document and mitigate: prompt injection from ticket bodies; secret leakage into agent context (scrub `.env`, `*credentials*`); sandbox escape; OAuth token at-rest encryption; signed webhooks.
- **Cost guardrails.** Per-user / per-org daily token + sandbox-minute caps with hard halt. Surface remaining budget in the top bar.
- **Telemetry.** OpenTelemetry traces for every dispatch; PostHog for product analytics; Sentry for client + server errors.
- **Docs.** `/docs/architecture.md`, `/docs/adapters.md` (writing a new repo/issue provider), `/docs/skills.md`, contributor `CONTRIBUTING.md`.
- **Design QA.** Every phase ends with a side-by-side comparison vs the original reference image; deltas tracked as polish issues.

---

## Open Questions to Resolve Before Starting

These are the must-answer items from the spec doc; the phases above assume the defaults from the table near the top of this file.

1. Bitbucket-only or both Bitbucket + GitHub for v1?
2. Self-hosted Jira support, or Cloud-only?
3. Sandbox provider — pick one before Phase 4 starts.
4. Pricing / cost cap defaults per user — needed before public beta.
5. Hosting region(s) and data-residency constraints.
6. Single-org pilot vs open public beta — affects RBAC depth needed.

---

## Definition of Done · v1 ship gate

A v1 ships when **every** item is true:

- [ ] A new user can complete the whole demo sentence (above) within 10 minutes from cold.
- [ ] One real team has run a real day of work through it without falling back to Jira/Bitbucket UIs.
- [ ] CI is green on `main` (typecheck, lint, tests, build, e2e smoke).
- [ ] No `TODO`/`FIXME` referencing v1 scope is left in `src/`.
- [ ] Cost guardrails proven: a runaway agent halts at the budget cap with a clear toast.
- [ ] Security review signed off (threat model items each have a documented mitigation).
- [ ] Docs cover: setup, OAuth, adapter authoring, skill authoring, deploy, runbook for incidents.
- [ ] Telemetry dashboards live for: dispatch volume, success/failure rate, average wall-clock per skill, $/quest, error rate by adapter.
