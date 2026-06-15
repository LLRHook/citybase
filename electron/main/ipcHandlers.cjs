// Pure factory that returns the channel→handler map for ipcMain.handle.
// Lives in its own file (no `require('electron')`) so unit tests can import
// it directly with stubbed services.
//
// ipc.cjs glues this to the real ipcMain by iterating over the result.
//
// Returned shape:
//   { handlers, pumpAgentEvents }
//   - handlers: channel → handler map for ipcMain.handle
//   - pumpAgentEvents(runId): drains agentManager.streamEvents(runId)
//     and forwards each event to the renderer via the injected
//     sendAgentEvent. The startRun handler kicks this off without
//     awaiting, but tests can call it directly to assert fan-out.

const { AGENT_EVENT_CHANNEL } = require('./agents/constants.cjs');

function createIpcHandlers({
  app,
  workspaceService,
  gitService,
  agentManager,
  detectAgentBinaries,
  sendAgentEvent,
  getMainWindow,
  runWorkspaceChecks,
} = {}) {
  if (!app || typeof app.getVersion !== 'function') {
    throw new TypeError('createIpcHandlers: app is required');
  }
  if (!workspaceService) throw new TypeError('createIpcHandlers: workspaceService is required');
  if (!gitService) throw new TypeError('createIpcHandlers: gitService is required');
  if (!agentManager || typeof agentManager.startRun !== 'function') {
    throw new TypeError('createIpcHandlers: agentManager is required');
  }
  if (typeof detectAgentBinaries !== 'function') {
    throw new TypeError('createIpcHandlers: detectAgentBinaries must be a function');
  }
  if (typeof sendAgentEvent !== 'function') {
    throw new TypeError('createIpcHandlers: sendAgentEvent must be a function');
  }
  if (typeof getMainWindow !== 'function') {
    throw new TypeError('createIpcHandlers: getMainWindow must be a function');
  }
  if (typeof runWorkspaceChecks !== 'function') {
    throw new TypeError('createIpcHandlers: runWorkspaceChecks must be a function');
  }

  const handleGitSnapshot = async (_evt, workspaceId) => {
    const ws = await workspaceService.getWorkspaceById(workspaceId);
    if (!ws) throw new Error(`unknown workspace id: ${workspaceId}`);
    return gitService.getSnapshot(ws);
  };

  // Drain manager.streamEvents(runId) and push each event to the renderer.
  // Errors during iteration are surfaced as a final 'error' AgentEvent so
  // the renderer can react instead of swallowing the failure.
  async function pumpAgentEvents(runId) {
    try {
      for await (const event of agentManager.streamEvents(runId)) {
        sendAgentEvent({ runId, event });
      }
    } catch (err) {
      sendAgentEvent({
        runId,
        event: {
          runId,
          t: '00:00',
          kind: 'error',
          text: (err && err.message) || String(err),
        },
      });
    }
  }

  const handlers = {
    'citybase:app.getVersion': () => app.getVersion(),
    'citybase:app.getPlatform': () => process.platform,

    'citybase:workspace.pick': async () => workspaceService.pickWorkspace({ window: getMainWindow() }),
    'citybase:workspace.getCurrent': () => workspaceService.getCurrentWorkspace(),
    'citybase:workspace.setCurrent': (_evt, id) => workspaceService.setCurrentWorkspace(id),
    'citybase:workspace.listRecent': () => workspaceService.listRecentWorkspaces(),
    'citybase:workspace.forget': (_evt, id) => workspaceService.forgetWorkspace(id),

    'citybase:git.getSnapshot': handleGitSnapshot,
    'citybase:git.refresh': handleGitSnapshot,
    'citybase:git.listBranches': async (_evt, workspaceId) => {
      const ws = await workspaceService.getWorkspaceById(workspaceId);
      if (!ws) throw new Error(`unknown workspace id: ${workspaceId}`);
      if (typeof gitService.getBranches !== 'function') return [];
      return gitService.getBranches(ws);
    },

    'citybase:checks.run': async (_evt, workspaceId) => {
      const ws = await workspaceService.getWorkspaceById(workspaceId);
      if (!ws) throw new Error(`unknown workspace id: ${workspaceId}`);
      return runWorkspaceChecks({ workspace: ws });
    },

    'citybase:git.checkout': async (_evt, workspaceId, branchName) => {
      const ws = await workspaceService.getWorkspaceById(workspaceId);
      if (!ws) throw new Error(`unknown workspace id: ${workspaceId}`);
      if (typeof gitService.checkout !== 'function') {
        return { ok: false, error: { message: 'checkout not available' } };
      }
      return gitService.checkout(ws, branchName);
    },

    'citybase:git.commit': async (_evt, workspaceId, params) => {
      const ws = await workspaceService.getWorkspaceById(workspaceId);
      if (!ws) throw new Error(`unknown workspace id: ${workspaceId}`);
      if (typeof gitService.commit !== 'function') {
        return { ok: false, error: { message: 'commit not available' } };
      }
      return gitService.commit(ws, params);
    },

    'citybase:agents.detect': () => detectAgentBinaries(),
    'citybase:agents.list': () => agentManager.listProviders(),

    'citybase:agent.startRun': async (_evt, params) => {
      const run = await agentManager.startRun(params);
      // Fire-and-forget the streamEvents fan-out; the request/response
      // pair only carries the AgentRun handle. Renderer subscribes to
      // AGENT_EVENT_CHANNEL via preload to consume the events.
      pumpAgentEvents(run.runId).catch((err) => {
        sendAgentEvent({
          runId: run.runId,
          event: { runId: run.runId, t: '00:00', kind: 'error', text: String(err) },
        });
      });
      return run;
    },
    'citybase:agent.cancel': (_evt, runId) => agentManager.cancel(runId),
    'citybase:agent.getRun': (_evt, runId) => agentManager.getRun(runId),
    'citybase:agent.getEvents': (_evt, runId) => agentManager.getEvents(runId),
    'citybase:agent.listRuns': (_evt, opts) => agentManager.listRuns(opts || {}),
    'citybase:agent.reportUsage': (_evt, runId) => agentManager.reportUsage(runId),
    'citybase:agent.produceDiff': (_evt, runId) => agentManager.produceDiff(runId),
    'citybase:agent.runChecks': (_evt, runId) => agentManager.runChecks(runId),
    'citybase:agent.openPR': (_evt, runId, prParams) => agentManager.openPR(runId, prParams),

    // Approval flow: the adapter pauses on agentManager.requestApproval and
    // resolves only when the renderer calls approve or reject.
    'citybase:agent.approve': (_evt, runId) => agentManager.approveRun(runId),
    'citybase:agent.reject': (_evt, runId) => agentManager.rejectRun(runId),
    'citybase:agent.listPendingApprovals': () => agentManager.listPendingApprovals(),
  };

  return { handlers, pumpAgentEvents };
}

module.exports = { createIpcHandlers, AGENT_EVENT_CHANNEL };
