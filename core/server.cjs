#!/usr/bin/env node
// server.cjs — the citybase-core daemon (FEAT-022, v4 Phase A).
//
// Headless entry that serves the full citybase channel map as JSON-RPC over
// a loopback WebSocket. Frontends (the Godot app; scripted clients) spawn
// this process, pass a session token via the environment, and connect with
// `ws://127.0.0.1:<port>/?token=<token>`.
//
//   CITYBASE_CORE_TOKEN     session token (required unless --print-conn)
//   CITYBASE_CORE_PORT      port to bind (default: ephemeral)
//   CITYBASE_CORE_USERDATA  state directory override (default: the same
//                           platform dir Electron's userData resolves to,
//                           so both frontends share workspaces + runs)
//   --print-conn         mint a token, bind an ephemeral port, and print
//                        one JSON line {port, token} to stdout — for
//                        scripted clients that can read stdout (Godot
//                        cannot; it must set the env vars instead).
//
// The daemon reuses the exact modules the Electron shell runs — services,
// adapters, agentManager, createIpcHandlers — so both frontends share one
// brain, one approval boundary, and one persisted state directory.
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const { createIpcHandlers } = require('../electron/main/ipcHandlers.cjs');
const { createWorkspaceService } = require('../electron/main/services/workspaceServiceCore.cjs');
const gitService = require('../electron/main/services/gitService.cjs');
const processService = require('../electron/main/services/processService.cjs');
const { runWorkspaceChecks } = require('../electron/main/services/workspaceChecks.cjs');
const { createRunStore } = require('../electron/main/services/runStore.cjs');
const { createQuestService } = require('../electron/main/services/questService.cjs');
const { createAgentManager } = require('../electron/main/agents/agentManager.cjs');
const { detectAgentBinaries } = require('../electron/main/agents/detect.cjs');
const { CodexAdapter } = require('../electron/main/agents/CodexAdapter.cjs');
const { ClaudeAdapter } = require('../electron/main/agents/ClaudeAdapter.cjs');
const { buildBootPayload } = require('../electron/main/bootPayload.cjs');
const { createRpcServer } = require('./rpcServer.cjs');
const { resolveUserDataDir } = require('./userData.cjs');
const pkg = require('../package.json');

async function startCore({ token, port = 0, userDataDir = resolveUserDataDir() } = {}) {
  const workspaceService = createWorkspaceService({
    getUserDataDir: () => userDataDir,
    // No native dialog in headless mode: workspace.pick throws a clear
    // error and frontends use workspace.registerPath instead.
    showOpenDialog: null,
  });

  // sendAgentEvent must exist before the manager (needsApproval events flow
  // through it); the rpc server exists after the handlers. Late-bind.
  let rpc = null;
  const sendAgentEvent = (payload) => { if (rpc) rpc.broadcast(payload); };

  const runStore = createRunStore({ userDataDir });
  const agentManager = createAgentManager({
    adapters: {
      codex: new CodexAdapter({ processService }),
      claude: new ClaudeAdapter({ processService }),
    },
    detect: () => detectAgentBinaries(),
    emitEvent: sendAgentEvent,
    initialRuns: runStore.loadSync(),
    persist: (runs) => {
      runStore.save(runs).catch((err) => { console.error('[runStore] persist failed', err); });
    },
  });

  const { handlers } = createIpcHandlers({
    app: { getVersion: () => pkg.version },
    workspaceService,
    gitService,
    agentManager,
    detectAgentBinaries,
    sendAgentEvent,
    getMainWindow: () => null,
    runWorkspaceChecks: ({ workspace }) => runWorkspaceChecks({ workspace, processService }),
    questService: createQuestService(),
  });

  rpc = createRpcServer({
    handlers,
    token,
    WebSocketServer,
    port,
    buildBootPayload: () => buildBootPayload({
      detect: () => detectAgentBinaries(),
      getCurrentWorkspace: () => workspaceService.getCurrentWorkspace(),
    }),
  });

  const address = await rpc.ready;
  return { rpc, address };
}

async function main() {
  const printConn = process.argv.includes('--print-conn');
  let token = process.env.CITYBASE_CORE_TOKEN || '';
  if (!token) {
    if (!printConn) {
      console.error('citybase-core: CITYBASE_CORE_TOKEN is required (or pass --print-conn)');
      process.exit(2);
    }
    token = crypto.randomBytes(24).toString('hex');
  }
  const port = Number(process.env.CITYBASE_CORE_PORT || 0);
  const userDataDir = process.env.CITYBASE_CORE_USERDATA || resolveUserDataDir();

  const { rpc, address } = await startCore({ token, port, userDataDir });
  if (printConn) {
    process.stdout.write(JSON.stringify({ port: address.port, token }) + '\n');
  }
  console.error(`citybase-core v${pkg.version} listening on ws://127.0.0.1:${address.port}`);

  const shutdown = async () => { await rpc.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('citybase-core failed to start:', err);
    process.exit(1);
  });
}

module.exports = { startCore };
