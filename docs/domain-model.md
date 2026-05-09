# Citybase Domain Model

These are the core entities Citybase reasons about. The language is intentionally provider-neutral — these definitions hold regardless of whether the source-control remote is Bitbucket or GitHub, the issue tracker is Jira or something else, or the agent runtime is Claude, Codex, or Gemini.

In the current prototype, all entity data is mocked in [`src/data/seed.js`](../src/data/seed.js). Phase 1+ replaces that file with live projections from real services.

## Repo

A source-control repository linked to a Citybase workspace.

**Key fields**
- `name` — short name (e.g. `my-website`)
- `remote` — host + slug (e.g. `bitbucket.org/llrhook/my-website`)
- `branch` — currently checked-out branch
- `commit` — current commit SHA (short)

**Relationships**
- A repo contains many **districts** and **buildings**.
- Authors detected from a repo's commit history become **guilds**.

## District

A top-level folder in the repo, rendered as a hex zone in the city.

**Key fields**
- `id` — stable identifier
- `name` — folder path (e.g. `components/ui`, `lib`, `/` for root)
- `label` — display name (e.g. "Frontline Foundry")
- `sub` — short subtitle
- `color` — palette key (`cyan`, `magenta`, `amber`, `green`, `white`, `red`)
- `q`, `r` — axial hex coordinates
- `files` — file count in the district
- `health` — 0–100 quality score (driven by lint, complexity, test coverage in v1; mocked today)

**Relationships**
- A district contains many **buildings**.
- A district can be the `target` of a **quest**.

## Building

A single file within a district. Rendered as an isometric structure inside its district's hex.

**Key fields**
- `d` — parent district id
- `name` — file name (e.g. `github.ts`)
- `type` — visual class: `tower` (major / structurally important file) or `house` (secondary file)

**Relationships**
- Belongs to exactly one district.
- A quest may pin to a specific building via the quest's `file` field.

## Quest

A unit of work originating from Jira (or Bitbucket Issues, or another tracker). The Citybase equivalent of a ticket.

**Key fields**
- `id` — external ticket key (e.g. `JIRA-142`, `BB-218`)
- `source` — `jira` | `bitbucket` (extensible)
- `title` — human-readable summary
- `desc` — long-form description (the body of the ticket)
- `skill` — required skill: `bugfix` | `refactor` | `tests` | `review` | `lint` | `docs`
- `reward` — XP awarded on completion
- `points` — story-point estimate
- `target` — district id
- `file` — optional building name to highlight
- `status` — `open` | `active` | `done`
- `lane` — kanban lane: `todo` | `in-progress` | `in-review` | `blocked` | `done`
- `posted` — author who created the quest
- `errands` — optional list of subtasks (each with `id`, `title`, `done`)
- `pr` — optional, set once a PR is opened (number, additions, deletions, files, reviewers)
- `blockedBy` — optional array of quest ids
- `adventurer`, `guild` — set when an adventurer is dispatched

**Relationships**
- A quest belongs to a **saga** (epic) via `saga` (optional).
- A quest is dispatched to one **adventurer** under a **guild**, which spawns an **agent run**.

### Saga

An epic — a group of related quests forming a campaign.

**Key fields**
- `id` (e.g. `SAGA-12`)
- `title`, `desc`
- `target` — primary district
- `progress` — 0–1
- `questIds` — member quests

## Guild

A contributor — a real human author detected from the repo's commit history.

**Key fields**
- `id` — slug (e.g. `victor`)
- `name` — display name (e.g. "House Ivanov")
- `author` — real name
- `handle` — repo handle (`@LLRHook`)
- `level`, `xp`, `xpNext` — gamified progression derived from commit history
- `role` — `admin` | `member` | `viewer`
- `commits` — commit count
- `crest` — single letter
- `color` — palette key
- `adventurers` — list of adventurers under this guild

**Relationships**
- A guild owns many **adventurers**.
- A guild is identified with a real-world contributor.

## Adventurer

A configured coding agent that belongs to a guild. Each user can configure their own adventurers (per-account).

**Key fields**
- `id` — slug (e.g. `alpha-7`)
- `name` — display name
- `class` — flavor label (`Refactorer`, `Test Smith`, `Bug Hunter`, `Doc Scribe`)
- `level`, `xp`, `xpNext`
- `mp` — magic points (reserved for spells / production actions)
- `status` — `idle` | `active` | `questing`
- `skills` — allowed skill list (subset of the quest skill set)
- `maxContext` — token-window ceiling for this adventurer's underlying model
- `contextUsed` — current tokens consumed in the active run

**HP model.** HP represents **remaining context capacity**, not health: `hp% = (1 − contextUsed / maxContext) × 100`. Resting (compaction) restores HP.

**Relationships**
- Belongs to one guild.
- Performs zero or more **agent runs**.

## Agent Run

One invocation of an adventurer against a quest. The unit of work the runtime layer executes.

**Key fields**
- `runId` — unique
- `questId`, `adventurerId`
- `status` — `running` | `done` | `failed` | `cancelled`
- `contextUsed`, `maxContext` — current token usage (drives HP live)
- `branch` — feature branch the run is committing to
- `reasoning` — ordered list of steps (`plan`, `edit`, `test`, `lint`, `pr`)
- `diff` — produced changes (files, hunks, additions, deletions)
- `checks` — results from running CI-equivalent checks inside the sandbox
- `pr` — optional, set once a PR is opened (number, URL)

**Relationships**
- Tied to exactly one quest and exactly one adventurer.
- The `AgentProvider` interface (see [agent-runtime.md](./agent-runtime.md)) defines how runs are started, streamed, and finalized — provider-neutrally.

---

## Glossary cross-reference

| Game term | Real-world meaning |
|---|---|
| District | Top-level folder |
| Building | File |
| Quest | Ticket / issue |
| Saga | Epic |
| Errand | Subtask |
| Guild | Contributor (human author) |
| Adventurer | Coding agent |
| Dispatch | Start an agent run |
| HP | Remaining context window |
| Rest Camp | Conversation compaction / reset |
| PR / Review | Same as in source control |
