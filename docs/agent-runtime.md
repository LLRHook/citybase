# Agent Runtime Contract

This contract decouples Citybase from any specific AI provider. **Claude Agent SDK is the default adapter** — it is what ships in Phase 4 — but it is not the required runtime. OpenAI Codex, Gemini, Aider, OpenCode, and local models (e.g. via Ollama) may each implement the same `AgentProvider` interface and drop in.

The ROADMAP entry "Agent runtime: Claude Agent SDK (Sonnet/Opus), pluggable adapter for OpenAI later" should be read as: Claude is the **default adapter** and the first one we ship, not as the runtime layer itself. The runtime layer is provider-neutral.

## Why this exists

Three things were true when this contract was written:

1. The roadmap originally hard-coded Claude model names and "wrapping Claude's SDK" into Phase 4.
2. The user wanted the option to use Codex, Gemini, or local models for development today, without rewriting the dispatch layer.
3. Free-tier AI tooling shifts every quarter — committing the runtime to one vendor would force a migration every time the math changes.

Defining `AgentProvider` once, up front, lets every later phase treat the runtime as a swappable detail.

## Capabilities

The interface below is expressed in TypeScript-style pseudocode for clarity. The codebase is JavaScript today; adapters can be implemented in JS without losing the contract.

```typescript
// Pseudocode — codebase is JS. This expresses the intent for future typed adapters.

interface AgentRun {
  runId: string;
  questId: string;
  adventurerId: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  contextUsed: number;   // tokens consumed so far
  maxContext: number;
  branch?: string;       // feature branch the run is committing to
}

interface AgentEvent {
  runId: string;
  t: string;             // HH:MM timestamp
  kind: 'plan' | 'edit' | 'test' | 'lint' | 'pr' | 'error';
  text: string;
  payload?: unknown;     // diff hunks, check results, structured detail
}

interface DiffHunk {
  line: number;
  type: 'add' | 'del' | 'ctx';
  code: string;
}

interface DiffFile {
  file: string;
  kind: 'add' | 'modify' | 'delete';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

interface CheckResult {
  name: string;                              // 'lint · eslint', 'unit · vitest', etc.
  state: 'pass' | 'fail' | 'warn';
  meta: string;                              // human-readable summary
}

interface PullRequest {
  prNumber: number;
  url: string;
}

interface AgentProvider {
  /** Start a new agent run for a quest. Returns a run handle. */
  startTask(params: {
    questId: string;
    adventurerId: string;
    skill: 'bugfix' | 'refactor' | 'tests' | 'review' | 'lint' | 'docs';
    repoUrl: string;
    branch: string;            // base branch to fork from
    promptContext: string;     // quest description + errand list, pre-built
    model?: string;            // optional override (e.g. 'claude-opus-4-7', 'gpt-5-codex')
  }): Promise<AgentRun>;

  /** Stream reasoning events for a run. Caller iterates the async iterable. */
  streamEvents(runId: string): AsyncIterable<AgentEvent>;

  /** Report current context usage for the HP bar. Polled, e.g. every 2s. */
  reportUsage(runId: string): Promise<{ contextUsed: number; maxContext: number }>;

  /** Produce a structured diff for the Analysis view once the run completes. */
  produceDiff(runId: string): Promise<{ files: DiffFile[] }>;

  /** Run checks (lint, tests, typecheck) inside the sandbox and return results. */
  runChecks(runId: string): Promise<CheckResult[]>;

  /** Open a pull request on the remote. Returns PR identifier. */
  openPR(runId: string, params: {
    title: string;
    body: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<PullRequest>;

  /** Cancel a running task (user abort or budget cap hit). */
  cancel(runId: string): Promise<void>;
}
```

## Adapter responsibilities

Every adapter must:

- Implement all 7 methods. `startTask`, `streamEvents`, `reportUsage`, `produceDiff`, `runChecks`, `openPR`, `cancel`.
- Surface token-limit errors gracefully — fail the run with a clear `error` event, never silently truncate.
- Set `status: 'failed'` on unrecoverable errors and emit a final `error` event with a human-readable message.
- Strip secrets from event payloads. The reasoning trail must not contain `.env` contents, OAuth tokens, or PR-creation credentials.
- Be cancellable. `cancel(runId)` must terminate the underlying model call and any sandbox process within a few seconds.
- Report usage continuously. `contextUsed` should reflect post-call token counts, not pre-call estimates.

Adapters should not:

- Mutate state outside the run's sandbox.
- Open PRs as a side effect of `produceDiff` — the orchestrator decides when to call `openPR`.
- Retry indefinitely. Bubble failures up so the orchestrator can apply budget rules.

## Default adapter

`ClaudeAdapter` wraps the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) and ships in Phase 4. It uses Claude Sonnet 4.6 by default with optional override to Opus 4.7 for high-complexity quests and Haiku 4.5 for cheap routine work.

## Other adapters (planned)

- `CodexAdapter` — OpenAI Codex CLI / GPT-5 family.
- `GeminiAdapter` — Gemini CLI / Code Assist API.
- `AiderAdapter` — local development; Aider CLI driving any model.
- `OllamaAdapter` — fully local (privacy-sensitive flows, dev experiments).

Each adapter implements the same `AgentProvider` interface. Selection is per-adventurer in the user's configuration, not global.

## Where this fits in the ROADMAP

This document affects:

- **Phase 3 (Guilds & adventurers)** — the adventurer config UI exposes `model` and `adapter` choices.
- **Phase 4 (Dispatch & sandbox)** — the agent runner calls `AgentProvider` rather than the Claude Agent SDK directly.
- **Phase 5 (PR + review loop)** — `openPR` is the only PR-creation surface.
- **Phase 6 (Metrics)** — `reportUsage` and `runChecks` feed the HP bar and check rows respectively.

The contract is intentionally minimal. New methods should be added only when a real product need cannot be met by composing the existing ones.
