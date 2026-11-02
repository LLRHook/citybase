# Agent runtime contract

Citybase runs local CLIs through a provider-neutral JavaScript interface.
`ClaudeAdapter` and `CodexAdapter` extend `CliAgentAdapter`; they do not embed a
Claude SDK or OpenAI SDK. Implementation:
[`electron/main/agents/`](../electron/main/agents/).

## Ownership and lifecycle

The shared handler resolves a known workspace ID to a service-side directory.
The manager assigns the run ID, selects an adapter, returns a running handle
without waiting for completion, and owns history and approval state. The adapter
owns the CLI child and output normalization. `processService.cjs` owns spawning,
platform invocation, timeouts, streaming buffers and termination.

Both UIs request approval. The manager waits before starting the provider;
rejecting records a cancelled run without spawning it. Approval covers the whole
run. There is no per-tool confirmation or automatic per-run Git worktree: work
runs in the selected working tree. Do not describe it as an isolated sandbox.

## Provider methods

| Method | Contract |
|---|---|
| `startTask(params)` | Start a task for the manager's run/workspace context; return the mutable run handle. |
| `streamEvents(runId)` | Async iterable of flat events; Claude can stream while running. |
| `reportUsage(runId)` | Usage envelope. CLI usage can be partial or unavailable; default values do not prove a live context-window meter. |
| `produceDiff(runId)` | Inspect the working tree, including untracked additions, and return bounded structured changes. This is observation, not attribution. |
| `runChecks(runId)` | Run declared lint/test/typecheck scripts. A successful CLI run and passing checks are separate facts. |
| `openPR(runId, params)` | Invoke `gh` for the source/target branches. Push first; this operation does not auto-push or merge. |
| `cancel(runId)` | Terminate the provider child; the manager coordinates approval and cancelled status. |

The executable base interface is
[`AgentAdapter.cjs`](../electron/main/agents/AgentAdapter.cjs). Manager-facing
operations also include start/get/list runs, get events, approve/reject and
pending approvals. Transport arguments are in
[DATA_CONTRACTS.md](DATA_CONTRACTS.md).

## Current adapters

- Claude uses `claude --print --output-format stream-json --verbose`, a model,
  and `--permission-mode bypassPermissions`. `DEFAULT_MODEL` in
  `ClaudeAdapter.cjs` is authoritative; callers can override `model`. NDJSON
  parsing produces real activity and terminal events.
- Codex uses `codex exec --cd <workspace> --sandbox workspace-write`,
  `approval_policy=never`, and stdin. A supplied model is forwarded; otherwise
  the CLI selects its configured default. Its inherited synthesized trail is a
  known limitation (BUG-003). Do not claim Claude-equivalent live tool events.

Gemini, Aider and local-model adapters are future possibilities, not installed
production adapters. Binary detection searches host installations/PATH; Citybase
does not authenticate provider accounts for the user.

## Events, history and failures

Events are flat `{runId, t, kind, text, payload?}` values, wrapped for transport
as `{runId, event}`. Optional payloads can carry status, paths, usage or approval
information. This display stream is neither hidden chain-of-thought nor an
audit of every action performed by a provider.

Only terminal summaries persist, with capped trails. Restarting does not resume
a child or restore a complete diff. Storage limits and corruption behavior are
in [DATA_CONTRACTS.md](DATA_CONTRACTS.md).

Tests use deterministic injected boundaries and labeled CLI fixtures. A fixture
pass proves Citybase's lifecycle; real provider availability, quota, generated
output quality and cost are separate evidence.
