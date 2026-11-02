// Optional engine regression: GODOT_BIN must name an installed Godot 4.7+
// executable. This uses real loopback RPC and never starts an agent.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createRpcServer } from '../core/rpcServer.cjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const binary = process.env.GODOT_BIN;
if (!binary) throw new Error('Set GODOT_BIN to a Godot executable to run this regression.');
const token = 'godot-transport-regression-token';
const result = { marker: 'complete', content: 'x'.repeat(128 * 1024) };
const sockets = new Set();
let probeCalls = 0;
class TestWebSocketServer extends WebSocketServer {
  constructor(options) {
    super(options);
    this.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
  }
}
const rpc = createRpcServer({
  token,
  WebSocketServer: TestWebSocketServer,
  handlers: {
    'citybase:transport.probe': () => { probeCalls += 1; return result; },
    'citybase:transport.oversize': () => ({ content: 'x'.repeat(2 * 1024 * 1024) }),
    'citybase:transport.disconnect': () => {
      setTimeout(() => {
        for (const socket of sockets) socket.close(1011, 'fixture server shutdown');
      }, 20);
      return { ok: true };
    },
  },
});
const address = await rpc.ready;
console.log(`Transport fixture: ${Buffer.byteLength(JSON.stringify({ id: 1, result }))} bytes`);
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(binary, ['--headless', '--path', join(root, 'godot'), '--script', 'res://tests/transport.gd'], {
      windowsHide: true,
      env: { ...process.env, CITYBASE_TEST_PORT: String(address.port), CITYBASE_TEST_TOKEN: token },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', resolve);
  });
  process.exitCode = code ?? 1;
  if (probeCalls !== 2) {
    console.error(`Expected two explicit probe calls, received ${probeCalls}`);
    process.exitCode = 1;
  }
} finally {
  await rpc.close();
}
