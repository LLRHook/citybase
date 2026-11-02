import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { acquireUserDataLock } from '../../core/userDataLock.cjs';

const directories = [];
const releases = [];
const children = [];

afterEach(async () => {
  await Promise.all(releases.splice(0).map((release) => release()));
  await Promise.all(children.splice(0).map(async (child) => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
  }));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'citybase-core-profile-'));
  directories.push(directory);
  return directory;
}

async function acquire(directory) {
  const release = await acquireUserDataLock(directory);
  releases.push(release);
  return release;
}

describe('core user-data ownership', () => {
  it('rejects a second live owner and permits acquisition after idempotent release', async () => {
    const directory = await fixture();
    const release = await acquire(directory);
    await expect(acquireUserDataLock(directory)).rejects.toMatchObject({ code: 'CORE_PROFILE_IN_USE' });
    await release();
    await release();
    await acquire(directory);
  });

  it('never grants two simultaneous claims to the same profile', async () => {
    const directory = await fixture();
    const claims = await Promise.allSettled([acquire(directory), acquire(directory)]);
    const granted = claims.filter((claim) => claim.status === 'fulfilled');
    expect(granted.length).toBeLessThanOrEqual(1);
    for (const claim of claims.filter((claim) => claim.status === 'rejected')) {
      expect(claim.reason).toMatchObject({ code: 'CORE_PROFILE_IN_USE' });
    }
    await Promise.all(granted.map((claim) => claim.value()));
    await acquire(directory);
  });

  it('reclaims a profile after its owner is forcibly killed', async () => {
    const directory = await fixture();
    const child = spawn(process.execPath, ['-e',
      "require(process.argv[1]).acquireUserDataLock(process.argv[2]).then(() => { console.log('ready'); setInterval(() => {}, 1000); }).catch(error => { console.error(error); process.exit(1); });",
      resolve('core/userDataLock.cjs'), directory,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    const [ready] = await once(child.stdout, 'data');
    expect(String(ready).trim()).toBe('ready');
    await expect(acquireUserDataLock(directory)).rejects.toMatchObject({ code: 'CORE_PROFILE_IN_USE' });
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    await acquire(directory);
  }, 10000);

  it('preserves unrelated files inside the claim directory', async () => {
    const directory = await fixture();
    const claims = join(directory, '.citybase-core-locks');
    await mkdir(claims);
    const unrelated = join(claims, 'notes.txt');
    await writeFile(unrelated, 'keep this');
    const release = await acquire(directory);
    await release();
    expect(await readFile(unrelated, 'utf8')).toBe('keep this');
  });

  it('does not replace a pre-existing file at the claim-directory path', async () => {
    const directory = await fixture();
    const existing = join(directory, '.citybase-core-locks');
    await writeFile(existing, 'keep this');
    await expect(acquireUserDataLock(directory)).rejects.toThrow();
    expect(await readFile(existing, 'utf8')).toBe('keep this');
  });
});
