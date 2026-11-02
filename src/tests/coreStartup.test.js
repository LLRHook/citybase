// Exercise the executable entry point: frontend instances must receive their
// own already-bound port without publishing their session tokens to disk.
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { CLOSE_UNAUTHORIZED } from '../../core/rpcServer.cjs';

const children = [];
const directories = [];
const sockets = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(children.splice(0).map(async (child) => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function launch(name, { invalidConnectionPath = false, existingFile = '', userDataDir } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'citybase-core-startup-'));
  directories.push(directory);
  const connectionFile = join(directory, invalidConnectionPath ? 'missing/connection.json' : 'connection.json');
  if (existingFile) await writeFile(connectionFile + (existingFile === 'temp' ? '.tmp' : ''), 'existing launch');
  const token = `test-startup-${name}-0123456789abcdef`;
  const child = spawn(process.execPath, [resolve('core/server.cjs')], {
    windowsHide: true,
    env: {
      ...process.env,
      CITYBASE_CORE_TOKEN: token,
      CITYBASE_CORE_PORT: '0',
      CITYBASE_CORE_USERDATA: userDataDir || directory,
      CITYBASE_CORE_CONNECTION_FILE: connectionFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  return { child, connectionFile, token, userDataDir: userDataDir || directory };
}

async function readReady(instance) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (instance.child.exitCode !== null) throw new Error(`Core exited with ${instance.child.exitCode}`);
    try {
      return JSON.parse(await readFile(instance.connectionFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Core did not publish readiness');
}

describe('core executable startup', () => {
  it('binds independent ports and authenticates two concurrent frontend sessions', async () => {
    const instances = await Promise.all([launch('a'), launch('b')]);
    const ready = await Promise.all(instances.map(readReady));
    expect(ready[0].port).not.toBe(ready[1].port);
    for (let index = 0; index < instances.length; index += 1) {
      expect(ready[index]).toEqual({ port: expect.any(Number), pid: instances[index].child.pid });
      const socket = new WebSocket(`ws://127.0.0.1:${ready[index].port}/?token=${instances[index].token}`);
      sockets.push(socket);
      await once(socket, 'open');
      const response = new Promise((resolve) => socket.on('message', (data) => {
        const message = JSON.parse(String(data));
        if (message.id === 1) resolve(message);
      }));
      socket.send(JSON.stringify({ id: 1, method: 'app.getVersion', params: [] }));
      expect(await response).toEqual({ id: 1, result: expect.any(String) });
    }
    const wrongSession = new WebSocket(`ws://127.0.0.1:${ready[0].port}/?token=${instances[1].token}`);
    sockets.push(wrongSession);
    expect((await once(wrongSession, 'close'))[0]).toBe(CLOSE_UNAUTHORIZED);
  }, 15000);

  it('exits instead of leaving a listening core when readiness cannot be published', async () => {
    const instance = await launch('bad-file', { invalidConnectionPath: true });
    const [code] = await once(instance.child, 'exit');
    expect(code).toBe(1);
    await expect(readFile(instance.connectionFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  }, 15000);

  it.each(['final', 'temp'])('preserves a pre-existing %s readiness file on startup failure', async (existingFile) => {
    const instance = await launch('collision', { existingFile });
    const [code] = await once(instance.child, 'exit');
    expect(code).toBe(1);
    const existingPath = instance.connectionFile + (existingFile === 'temp' ? '.tmp' : '');
    expect(await readFile(existingPath, 'utf8')).toBe('existing launch');
  }, 15000);

  it('rejects a second writer to the same profile and reclaims it after a killed core', async () => {
    const first = await launch('profile-owner');
    await readReady(first);
    const second = await launch('profile-collision', { userDataDir: first.userDataDir });
    const [collisionExit] = await once(second.child, 'exit');
    expect(collisionExit).toBe(1);
    expect(JSON.parse(await readFile(second.connectionFile, 'utf8'))).toEqual({
      pid: second.child.pid,
      error: expect.stringContaining('CITYBASE_CORE_USERDATA'),
    });
    expect(first.child.exitCode).toBeNull();
    const killed = once(first.child, 'exit');
    first.child.kill('SIGKILL');
    await killed;
    const restarted = await launch('profile-restarted', { userDataDir: first.userDataDir });
    expect(await readReady(restarted)).toEqual({ port: expect.any(Number), pid: restarted.child.pid });
  }, 15000);
});
