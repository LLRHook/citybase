import { describe, expect, it, vi } from 'vitest';
import {
  runWorkspaceChecks,
  buildNpmArgv,
  WANTED_SCRIPTS,
} from '../../electron/main/services/workspaceChecks.cjs';

function makeProcessService(overrides = {}) {
  return {
    run: vi.fn(async () => ({
      ok: true, code: 0, signal: null, stdout: '', stderr: '',
      timedOut: false, durationMs: 80, error: null,
    })),
    ...overrides,
  };
}

describe('buildNpmArgv', () => {
  it('builds the bare lint argv', () => {
    expect(buildNpmArgv('lint')).toEqual(['run', 'lint', '--silent']);
  });

  it('forwards "-- --run" only for the test script (Vitest watch-mode guard)', () => {
    expect(buildNpmArgv('test')).toEqual(['run', 'test', '--silent', '--', '--run']);
    expect(buildNpmArgv('typecheck')).toEqual(['run', 'typecheck', '--silent']);
  });
});

describe('WANTED_SCRIPTS', () => {
  it('exposes the canonical lint / test / typecheck triplet', () => {
    expect([...WANTED_SCRIPTS]).toEqual(['lint', 'test', 'typecheck']);
  });
});

describe('runWorkspaceChecks — argument shape', () => {
  it('returns [] when workspace is missing or has no rootPath', async () => {
    expect(await runWorkspaceChecks({ processService: makeProcessService() })).toEqual([]);
    expect(await runWorkspaceChecks({ workspace: {}, processService: makeProcessService() })).toEqual([]);
  });

  it('throws when processService.run is missing', async () => {
    await expect(runWorkspaceChecks({
      workspace: { rootPath: '/r' },
      readFileSync: () => '{}',
    })).rejects.toThrow(/processService\.run is required/);
  });
});

describe('runWorkspaceChecks — script discovery', () => {
  it('returns [] when package.json cannot be read', async () => {
    const ps = makeProcessService();
    const out = await runWorkspaceChecks({
      workspace: { rootPath: '/r' },
      processService: ps,
      readFileSync: () => { throw new Error('ENOENT'); },
    });
    expect(out).toEqual([]);
    expect(ps.run).not.toHaveBeenCalled();
  });

  it('returns [] when package.json has no scripts field', async () => {
    const ps = makeProcessService();
    const out = await runWorkspaceChecks({
      workspace: { rootPath: '/r' },
      processService: ps,
      readFileSync: () => JSON.stringify({}),
    });
    expect(out).toEqual([]);
  });

  it('only runs declared scripts (ignores undeclared lint/test/typecheck)', async () => {
    const ps = makeProcessService();
    const pkg = JSON.stringify({ scripts: { lint: 'eslint .' } });
    const out = await runWorkspaceChecks({
      workspace: { rootPath: '/r' },
      processService: ps,
      readFileSync: () => pkg,
    });
    expect(out).toHaveLength(1);
    expect(ps.run).toHaveBeenCalledTimes(1);
    expect(out[0].name).toBe('lint · npm run lint');
  });
});

describe('runWorkspaceChecks — result mapping', () => {
  it('classifies a clean exit as state=pass with "clean in Nms"', async () => {
    const ps = makeProcessService();
    const pkg = JSON.stringify({ scripts: { lint: 'eslint .' } });
    const [check] = await runWorkspaceChecks({
      workspace: { rootPath: '/r' }, processService: ps, readFileSync: () => pkg,
    });
    expect(check).toEqual({ name: 'lint · npm run lint', state: 'pass', meta: 'clean in 80ms' });
  });

  it('classifies a non-zero exit as state=fail with "exited N"', async () => {
    const ps = makeProcessService({
      run: vi.fn(async () => ({
        ok: false, code: 1, signal: null, stdout: '', stderr: '',
        timedOut: false, durationMs: 200, error: { message: 'exit 1' },
      })),
    });
    const pkg = JSON.stringify({ scripts: { test: 'vitest' } });
    const [check] = await runWorkspaceChecks({
      workspace: { rootPath: '/r' }, processService: ps, readFileSync: () => pkg,
    });
    expect(check).toEqual({ name: 'test · npm run test', state: 'fail', meta: 'exited 1' });
  });

  it('classifies a timeout as state=fail with "timed out after Nms"', async () => {
    const ps = makeProcessService({
      run: vi.fn(async () => ({
        ok: false, code: null, signal: 'SIGTERM', stdout: '', stderr: '',
        timedOut: true, durationMs: 15_000, error: { message: 'ETIMEDOUT' },
      })),
    });
    const pkg = JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } });
    const [check] = await runWorkspaceChecks({
      workspace: { rootPath: '/r' }, processService: ps, readFileSync: () => pkg,
    });
    expect(check.state).toBe('fail');
    expect(check.meta).toBe('timed out after 15000ms');
  });

  it('runs scripts in canonical order (lint, then test, then typecheck)', async () => {
    const ps = makeProcessService();
    const pkg = JSON.stringify({
      scripts: { typecheck: 'tsc --noEmit', test: 'vitest', lint: 'eslint .' },
    });
    const out = await runWorkspaceChecks({
      workspace: { rootPath: '/r' }, processService: ps, readFileSync: () => pkg,
    });
    expect(out.map((c) => c.name)).toEqual([
      'lint · npm run lint',
      'test · npm run test',
      'typecheck · npm run typecheck',
    ]);
  });

  it('passes the test script through with "-- --run" so vitest does not hang', async () => {
    const ps = makeProcessService();
    const pkg = JSON.stringify({ scripts: { test: 'vitest' } });
    await runWorkspaceChecks({
      workspace: { rootPath: '/r' }, processService: ps, readFileSync: () => pkg,
    });
    const [, argv] = ps.run.mock.calls[0];
    expect(argv).toEqual(['run', 'test', '--silent', '--', '--run']);
  });
});
