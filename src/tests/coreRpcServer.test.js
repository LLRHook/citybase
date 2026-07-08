// coreRpcServer — the WS JSON-RPC facade (FEAT-022) exercised over a real
// loopback socket with stub handlers: auth, dispatch, errors, event
// broadcast, and the boot push.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { createRpcServer, CLOSE_UNAUTHORIZED } from '../../core/rpcServer.cjs';

const TOKEN = 'test-token-0123456789abcdef';

function stubHandlers(overrides = {}) {
  return {
    'citybase:app.getVersion': vi.fn(() => '9.9.9'),
    'citybase:git.getSnapshot': vi.fn(async (_evt, workspaceId) => {
      if (workspaceId !== 'ws-1') throw new Error(`unknown workspace id: ${workspaceId}`);
      return { workspaceId, branch: 'main' };
    }),
    'citybase:agent.startRun': vi.fn(async (_evt, params) => ({ runId: 'run-1', status: 'running', ...params ? {} : {} })),
    ...overrides,
  };
}

let server;
const sockets = [];

afterEach(async () => {
  for (const s of sockets) { try { s.terminate(); } catch { /* closed */ } }
  sockets.length = 0;
  if (server) { await server.close(); server = null; }
});

async function startServer(opts = {}) {
  server = createRpcServer({
    handlers: stubHandlers(opts.handlers),
    token: TOKEN,
    WebSocketServer,
    buildBootPayload: opts.buildBootPayload,
  });
  const address = await server.ready;
  return address.port;
}

function connect(port, token = TOKEN) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`);
  sockets.push(socket);
  return socket;
}

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const onMsg = (data) => {
      const msg = JSON.parse(String(data));
      if (predicate(msg)) { socket.off('message', onMsg); resolve(msg); }
    };
    socket.on('message', onMsg);
    socket.once('close', (code) => reject(new Error(`closed: ${code}`)));
    socket.once('error', reject);
  });
}

function call(socket, id, method, params) {
  socket.send(JSON.stringify({ id, method, params }));
  return nextMessage(socket, (m) => m.id === id);
}

function opened(socket) {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

describe('createRpcServer — auth', () => {
  it('closes connections with a wrong or missing token before any dispatch', async () => {
    const port = await startServer();
    const bad = connect(port, 'wrong-token-0123456789abcdef');
    const code = await new Promise((resolve) => bad.once('close', resolve));
    expect(code).toBe(CLOSE_UNAUTHORIZED);
    expect(server.clientCount()).toBe(0);
  });

  it('accepts the minted token', async () => {
    const port = await startServer();
    const ok = connect(port);
    await opened(ok);
    const res = await call(ok, 1, 'app.getVersion');
    expect(res).toEqual({ id: 1, result: '9.9.9' });
  });
});

describe('createRpcServer — dispatch', () => {
  it('routes method + array params to the citybase:* handler', async () => {
    const port = await startServer();
    const socket = connect(port);
    await opened(socket);
    const res = await call(socket, 2, 'git.getSnapshot', ['ws-1']);
    expect(res.result).toEqual({ workspaceId: 'ws-1', branch: 'main' });
  });

  it('handler throws surface as {error} with the message', async () => {
    const port = await startServer();
    const socket = connect(port);
    await opened(socket);
    const res = await call(socket, 3, 'git.getSnapshot', ['nope']);
    expect(res.error.message).toMatch(/unknown workspace id: nope/);
  });

  it('unknown methods and invalid JSON produce errors, not silence', async () => {
    const port = await startServer();
    const socket = connect(port);
    await opened(socket);
    const res = await call(socket, 4, 'no.suchMethod');
    expect(res.error.message).toMatch(/unknown method/);

    socket.send('{not json');
    const bad = await nextMessage(socket, (m) => m.id === null && m.error);
    expect(bad.error.message).toMatch(/invalid JSON/);
  });
});

describe('createRpcServer — push', () => {
  it('broadcast delivers the agent-event envelope to connected clients', async () => {
    const port = await startServer();
    const socket = connect(port);
    await opened(socket);
    const payload = { runId: 'run-1', event: { runId: 'run-1', t: '00:01', kind: 'plan', text: 'hi' } };
    const waiting = nextMessage(socket, (m) => m.event === 'agent-event');
    server.broadcast(payload);
    expect(await waiting).toEqual({ event: 'agent-event', payload });
  });

  it('pushes the boot payload once on connect when a builder is provided', async () => {
    const port = await startServer({
      buildBootPayload: async () => ({ detect: { claude: { found: true } }, workspace: null }),
    });
    const socket = connect(port);
    const boot = await nextMessage(socket, (m) => m.event === 'boot');
    expect(boot.payload.detect.claude.found).toBe(true);
  });
});
