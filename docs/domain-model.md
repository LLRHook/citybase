# Citybase domain model

These are product concepts. Exact stored and transported fields belong in
[DATA_CONTRACTS.md](DATA_CONTRACTS.md), and implementation boundaries in
[ARCHITECTURE.md](ARCHITECTURE.md). Production views use live Git state and run
history; the former seed-data module no longer exists.

| Concept | Current meaning and limits |
|---|---|
| Workspace | A remembered local directory, resolved through a stable workspace ID. Registration validates a directory; the Git service separately reports a non-repository error. One workspace is selected per frontend. |
| Repository | The selected Git working tree: branch, changed paths, tracked tree and recent commits. It need not have a remote. |
| District | A folder grouping projected from the tree. Root files form a core district. Display limits are frontend-specific; the city is not an exhaustive file browser. |
| Building | A rendered repository file. Size/type/status influence its appearance. It is a visualization, not a second copy of source. |
| Quest | An open or in-progress entry read from `features.md` or `bugs.md`, or the task context supplied for a run. Remote issue-tracker integration is not implemented. |
| Agent/provider | A locally installed CLI behind AgentProvider. Claude and Codex adapters exist. Flavor names do not change provider capabilities. |
| Adventurer/avatar | Presentation of an agent run, moving or glowing at paths reported by its event stream. It has no independent process authority. |
| Agent run | One provider invocation with a manager-assigned ID, prompt, workspace, status and event trail. Dispatch, approval, settlement, review and persistence are distinct states. |
| Approval | Permission for the whole run before its CLI starts. Rejection starts no provider process. An approved unattended CLI can execute tools throughout the run. |
| Outcome | A review of observed changes, declared checks and events. It does not prove exclusive authorship or generated-project correctness. |
| History | Recent terminal summaries in `runs.json`, with capped trails. It is not a complete saved session or live process handle. |
| XP/level | A game display calculated from recent run statuses. BUG-037 tracks truncation; this is not yet durable lifetime progression. |
| Vitals | Git/check/run summaries. A clean tree is not a code-quality or coverage score. |

Guilds, sagas, external ticket sync, per-adventurer accounts and context-window
HP belong to the original vision and are not complete current services. The
[historical SRS](srs-and-plan-of-action.md) and [roadmap](../ROADMAP.md) retain
that context without implying implementation.
