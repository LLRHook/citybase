# Citybase data contracts

Contract baseline: the shared handler map, preload surface, RPC server and JSON
stores. This document records the existing unversioned protocol; it does not
introduce a wire-version field or change stored schemas.

## 1. Transport

Electron invokes `citybase:<method>` channels through `window.citybase`.
Godot authenticates at `ws://127.0.0.1:<port>/?token=<session-token>` and sends:

```json
{"id": 1, "method": "git.getSnapshot", "params": ["workspace-id"]}
```

Responses are `{id,result}` or `{id,error:{message}}`. Void results become
`null` over WS. This is Citybase's request/response envelope, not a claim of
complete JSON-RPC 2.0 conformance. Positional arrays are preferred; a non-array
`params` is passed as one argument. Unknown methods and invalid JSON produce
error envelopes. Authentication failure closes with 4401 before boot/dispatch.

Push frames are `{event:"boot",payload}`, `boot-error`, and
`{event:"agent-event",payload:{runId,event}}`. Godot's inbound/outbound allowance
is 1 MiB; oversized responses close visibly (1009). Retry reconnects to the same
live core and does not replay pending actions. An acknowledgement lost during a
disconnect leaves the operation's result unknown until reconciled.

## 2. Operation inventory

Names below omit the Electron `citybase:` prefix. Types are descriptive
JavaScript shapes, not a generated TypeScript API.

| Group | Methods / positional arguments | Result / failure |
|---|---|---|
| Application | `app.getVersion()`, `app.getPlatform()` | Strings |
| Workspace | `workspace.pick()`, `registerPath(rootPath)`, `getCurrent()`, `setCurrent(id)`, `listRecent()`, `forget(id)` | Workspace(s), null or void. Headless pick rejects; Godot uses registerPath. |
| Git read | `git.getSnapshot(workspaceId)`, `refresh(workspaceId)`, `listBranches(workspaceId)` | Snapshot/branches; unknown workspace rejects; a non-repo snapshot has an error envelope. |
| Git write | `git.checkout(workspaceId,branchName)`, `commit(workspaceId,params)` | Validated service result `{ok,...}`; refusal includes error information. No automatic new branch. |
| Workspace checks | `checks.run(workspaceId)` | Check rows for declared scripts only |
| Quests | `quests.list(workspaceId)` | Open/in-progress local tracker entries; channel present only with quest service, used by the core |
| Detection | `agents.detect()`, `agents.list()` | Installed CLI information / provider names |
| Run lifecycle | `agent.startRun(params)`, `cancel(runId)`, `getRun(runId)`, `getEvents(runId)`, `listRuns(options?)` | Run handle / events / newest-first summaries; default list limit 50 |
| Run inspection | `agent.reportUsage(runId)`, `produceDiff(runId)`, `runChecks(runId)`, `openPR(runId,prParams)` | Provider/inspection result; errors follow the shared handler behavior |
| Approval | `agent.approve(runId)`, `reject(runId)`, `listPendingApprovals()` | Decision or pending approvals; unknown pending run rejects |

`agent.startRun` receives `workspaceId`, quest/adventurer identifiers, skill,
provider, promptContext, optional model/branch and approval mode. The handler
discards renderer-supplied `repoUrl` and resolves cwd from the workspace registry.
The UIs use approval mode `ask`; the manager also has internal/non-UI modes.
Do not claim every authenticated RPC client is forced through the UI modal.

## 3. Entities and events

| ID | Shape and meaning |
|---|---|
| ENT-001 Workspace | `{id,name,rootPath,openedAt,lastOpenedAt}`. ID derives from the real path; it is not an authorization token. |
| ENT-002 Snapshot | `{workspaceId,rootPath,branch,ahead,behind,isDirty,files,recentCommits,repoTree,...}`. Branch can be null on detached HEAD. Non-repo includes `{error:{kind:"no-git",message}}`. |
| ENT-003 Run | `{runId,questId,adventurerId,status,contextUsed,maxContext,...}` in memory. Status is running/done/failed/cancelled; summary and persistence omit live handles. |
| ENT-004 Quest | `{id,title,kind,priority,status,summary}` read from the two root tracker files. Missing/unreadable trackers yield an empty projection. |
| EVT-001 Agent event | `{runId,t,kind,text,payload?}`. `t` is display time; payload is optional. Transport wraps it as `{runId,event}`. See the adapter contract for fidelity limits. |
| ENT-005 Check | `{name,state,meta}`, state pass/fail/warn. Only declared lint/test/typecheck scripts run; missing scripts do not establish a passing check. |

## 4. Storage and retention

`workspaces.json` is `{currentId,workspaces}` with at most 12 recent directories.
Mutations are serialized and use temp-file/rename replacement. A missing file
starts empty; unreadable/corrupt/invalid-shape files reject mutations before
writing. Read-only boot can fall back to an empty view. Repair or restore the
original file before registering/forgetting again.

`runs.json` is an array of at most 100 terminal summaries. A stored record keeps
runId, questId, adventurerId, status, provider, branch, startedAt, events and
historical. Each trail retains up to 60 valid event objects; text is truncated to
2,000 characters per event, and event payloads are not persisted. Malformed event
values are filtered before the trail cap. Invalid records are dropped. An invalid
top-level/unreadable file currently restores as empty history; run saves do not
have the workspace registry's corruption write barrier.

Writes are atomic and queued within each store instance. The core acquires a
PID/unique-claim profile lock with stale-process recovery. This is not a lock
against a simultaneously running legacy Electron instance. Close both hosts
before backup/restore; see [OPERATIONS.md](OPERATIONS.md).

## 5. Compatibility and open work

Preserve backward reading of the current JSON shapes. New required fields,
changed meaning or new retention semantics need a migration and restart tests.
The current recent-run list and the stored history are bounded activity views;
they cannot act as a durable lifetime XP ledger (BUG-037).

Truth owners: `ipcHandlers.cjs`, `preload.cjs`, `rpcServer.cjs`, `runStore.cjs`,
`workspaceServiceCore.cjs`, `questService.cjs`. Conformance tests compare the
handler/preload sets and exercise real loopback RPC.

## Revision history

| Rev | Date | Commit | Mode | Summary |
|---|---|---|---|---|
| 1 | 2026-11-02 | pending | ADOPT | Existing transport, storage, limits and compatibility |
