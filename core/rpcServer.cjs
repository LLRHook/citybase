// rpcServer.cjs — pure JSON-RPC-over-WebSocket facade for the citybase
// channel map (FEAT-022, v4 Phase A). No `require('electron')`, no service
// construction: callers hand in the same `handlers` object that
// createIpcHandlers produces, plus the WebSocketServer constructor, so unit
// tests can drive a real loopback socket with stub services.
//
// Protocol (docs/v4-game-engine.md):
//   request  → { id, method: 'agent.startRun', params: [args...] }
//   response → { id, result } | { id, error: { message } }
//   push     → { event: 'agent-event', payload }   (pumpAgentEvents envelope)
//              { event: 'boot', payload }          (once, on connect)
//
// Security: binds loopback only; every connection must present the session
// token as a `?token=` query parameter or it is closed before any message
// is processed (4401). The token is minted by the daemon at startup and
// reaches the frontend out-of-band (spawn environment).

const CHANNEL_PREFIX = 'citybase:';
const CLOSE_UNAUTHORIZED = 4401;

function createRpcServer({
  handlers,
  token,
  WebSocketServer,
  host = '127.0.0.1',
  port = 0,
  buildBootPayload = null,
} = {}) {
  if (!handlers || typeof handlers !== 'object' || Object.keys(handlers).length === 0) {
    throw new TypeError('createRpcServer: handlers map is required');
  }
  if (typeof token !== 'string' || token.length < 16) {
    throw new TypeError('createRpcServer: token must be a string of at least 16 chars');
  }
  if (typeof WebSocketServer !== 'function') {
    throw new TypeError('createRpcServer: WebSocketServer constructor is required');
  }

  const wss = new WebSocketServer({ host, port });
  const clients = new Set();

  wss.on('connection', (socket, request) => {
    if (!isAuthorized(request, token)) {
      socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
      return;
    }
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('message', (data) => {
      handleMessage(socket, data);
    });
    if (typeof buildBootPayload === 'function') {
      Promise.resolve()
        .then(buildBootPayload)
        .then((payload) => send(socket, { event: 'boot', payload }))
        .catch((err) => send(socket, { event: 'boot-error', payload: { message: messageOf(err) } }));
    }
  });

  async function handleMessage(socket, data) {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      send(socket, { id: null, error: { message: 'invalid JSON' } });
      return;
    }
    const { id = null, method, params } = msg || {};
    if (typeof method !== 'string' || !method) {
      send(socket, { id, error: { message: 'method must be a non-empty string' } });
      return;
    }
    const handler = handlers[CHANNEL_PREFIX + method];
    if (typeof handler !== 'function') {
      send(socket, { id, error: { message: `unknown method: ${method}` } });
      return;
    }
    const args = Array.isArray(params) ? params : params === undefined ? [] : [params];
    try {
      // Handlers share the ipcMain.handle signature: (event, ...args).
      // There is no IPC event in the WS world; null keeps the shape.
      const result = await handler(null, ...args);
      send(socket, { id, result: result === undefined ? null : result });
    } catch (err) {
      send(socket, { id, error: { message: messageOf(err) } });
    }
  }

  function broadcast(payload) {
    const frame = JSON.stringify({ event: 'agent-event', payload });
    for (const socket of clients) {
      if (socket.readyState === 1 /* OPEN */) socket.send(frame);
    }
  }

  const ready = new Promise((resolve, reject) => {
    wss.on('listening', () => resolve(wss.address()));
    wss.on('error', reject);
  });

  async function close() {
    for (const socket of clients) socket.terminate();
    clients.clear();
    await new Promise((resolve) => wss.close(resolve));
  }

  return { ready, broadcast, close, clientCount: () => clients.size };
}

function isAuthorized(request, token) {
  try {
    const url = new URL(request.url, 'ws://localhost');
    const presented = url.searchParams.get('token') || '';
    return timingSafeEquals(presented, token);
  } catch {
    return false;
  }
}

// Constant-time comparison so the token can't be guessed byte-by-byte via
// response timing (loopback-only, but cheap to do right).
function timingSafeEquals(a, b) {
  const crypto = require('node:crypto');
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function messageOf(err) {
  return (err && err.message) || String(err);
}

function send(socket, obj) {
  if (socket.readyState === 1 /* OPEN */) socket.send(JSON.stringify(obj));
}

module.exports = { createRpcServer, CLOSE_UNAUTHORIZED };
