// Phase 5 slice 4 — first mutating Git surface in gitService.cjs.
// The functions are stateful (they shell out to git via processService),
// but the only way they touch the world is through processService.run.
// Tests build an isolated gitService via createGitService({ processService })
// and inject a mock — DI is the codebase-wide pattern (see ipcHandlers,
// workspaceChecks, agent adapters); vi.mock can't reliably intercept
// CJS require() chains in this test setup.
import { describe, expect, it, vi } from 'vitest';
import {
  createGitService,
  parseHeadHash,
} from '../../electron/main/services/gitService.cjs';

function ok(extras = {}) {
  return {
    ok: true, code: 0, signal: null, stdout: '', stderr: '',
    timedOut: false, durationMs: 5, error: null,
    ...extras,
  };
}
function fail(extras = {}) {
  return {
    ok: false, code: 1, signal: null, stdout: '', stderr: '',
    timedOut: false, durationMs: 5, error: { message: 'exit 1', code: 1 },
    ...extras,
  };
}

function buildService() {
  const run = vi.fn();
  const service = createGitService({ processService: { run } });
  return { run, ...service };
}

describe('parseHeadHash', () => {
  it('returns the trimmed hash for valid hex output', () => {
    expect(parseHeadHash('abc1234\n')).toBe('abc1234');
    expect(parseHeadHash('  deadbeef  ')).toBe('deadbeef');
    expect(parseHeadHash('1234567890abcdef1234567890abcdef12345678'))
      .toBe('1234567890abcdef1234567890abcdef12345678');
  });

  it('returns null for non-hex / empty / non-string input', () => {
    expect(parseHeadHash('')).toBeNull();
    expect(parseHeadHash('not-a-hash')).toBeNull();
    expect(parseHeadHash(null)).toBeNull();
    expect(parseHeadHash(undefined)).toBeNull();
  });
});

describe('checkout — argument validation', () => {
  it('rejects when workspace.rootPath is missing', async () => {
    const { checkout } = buildService();
    const out = await checkout(null, 'main');
    expect(out).toEqual({ ok: false, error: { message: 'workspace.rootPath is required' } });
  });

  it('rejects when branchName is missing or empty', async () => {
    const { checkout } = buildService();
    expect(await checkout({ rootPath: '/r' }, '')).toEqual({
      ok: false, error: { message: 'branchName is required' },
    });
    expect(await checkout({ rootPath: '/r' }, undefined)).toEqual({
      ok: false, error: { message: 'branchName is required' },
    });
  });
});

describe('checkout — branch existence guard', () => {
  it('refuses an unknown branch name (no -b auto-create)', async () => {
    const { run, checkout } = buildService();
    // First call: getBranches → empty list.
    run.mockResolvedValueOnce(ok({ stdout: '' }));
    const out = await checkout({ rootPath: '/r' }, 'never-existed');
    expect(out).toEqual({ ok: false, error: { message: 'branch not found: never-existed' } });
    // Only the listing call should have happened — never the checkout.
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1][0]).toBe('branch');
  });

  it('runs git checkout when the branch is in the listing', async () => {
    const { run, checkout } = buildService();
    run
      .mockResolvedValueOnce(ok({ stdout: 'main\t*\torigin/main\nfeature/x\t\t' }))
      .mockResolvedValueOnce(ok());
    const out = await checkout({ rootPath: '/r' }, 'feature/x');
    expect(out).toEqual({ ok: true, branch: 'feature/x' });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][0]).toBe('git');
    expect(run.mock.calls[1][1]).toEqual(['checkout', 'feature/x']);
    expect(run.mock.calls[1][2]).toEqual({ cwd: '/r' });
  });
});

describe('checkout — failure surfacing', () => {
  it('wraps non-zero exits as { ok: false, error }', async () => {
    const { run, checkout } = buildService();
    run
      .mockResolvedValueOnce(ok({ stdout: 'main\t*\t\nfeature\t\t' }))
      .mockResolvedValueOnce(fail({ stderr: 'fatal: not a tree' }));
    const out = await checkout({ rootPath: '/r' }, 'feature');
    expect(out.ok).toBe(false);
    expect(out.error.message).toMatch(/checkout failed: feature/);
    expect(out.error.stderr).toBe('fatal: not a tree');
    expect(out.error.code).toBe(1);
  });
});

describe('commit — argument validation', () => {
  it('rejects when workspace.rootPath is missing', async () => {
    const { commit } = buildService();
    expect(await commit(null, { message: 'x' })).toEqual({
      ok: false, error: { message: 'workspace.rootPath is required' },
    });
  });

  it('rejects empty / whitespace-only / missing message', async () => {
    const { commit } = buildService();
    const ws = { rootPath: '/r' };
    expect(await commit(ws, { message: '' })).toMatchObject({ ok: false });
    expect(await commit(ws, { message: '   ' })).toMatchObject({ ok: false });
    expect(await commit(ws, {})).toMatchObject({ ok: false });
  });
});

describe('commit — happy path', () => {
  it('runs add -A then commit, then reads HEAD', async () => {
    const { run, commit } = buildService();
    run
      .mockResolvedValueOnce(ok())                              // git add -A
      .mockResolvedValueOnce(ok({ stdout: 'commit ok' }))       // git commit
      .mockResolvedValueOnce(ok({ stdout: 'feedface\n' }));     // git rev-parse HEAD
    const out = await commit({ rootPath: '/r' }, { message: 'feat: thing' });
    expect(out).toEqual({ ok: true, commitHash: 'feedface' });
    const calls = run.mock.calls;
    expect(calls[0][1]).toEqual(['add', '-A']);
    expect(calls[1][1]).toEqual(['commit', '-m', 'feat: thing']);
    expect(calls[2][1]).toEqual(['rev-parse', 'HEAD']);
  });

  it('skips the staging step when addAll: false', async () => {
    const { run, commit } = buildService();
    run
      .mockResolvedValueOnce(ok())                          // git commit
      .mockResolvedValueOnce(ok({ stdout: 'feedface' }));   // rev-parse
    const out = await commit({ rootPath: '/r' }, { message: 'm', addAll: false });
    expect(out.ok).toBe(true);
    const calls = run.mock.calls;
    expect(calls[0][1]).toEqual(['commit', '-m', 'm']);
  });

  it('returns ok=true with commitHash=null when rev-parse fails (best-effort)', async () => {
    const { run, commit } = buildService();
    run
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail({ stderr: 'no HEAD yet' }));
    const out = await commit({ rootPath: '/r' }, { message: 'first' });
    expect(out).toEqual({ ok: true, commitHash: null });
  });
});

describe('commit — failure surfacing', () => {
  it('returns the add-failure error when git add explodes', async () => {
    const { run, commit } = buildService();
    run.mockResolvedValueOnce(fail({ stderr: 'permission denied' }));
    const out = await commit({ rootPath: '/r' }, { message: 'x' });
    expect(out.ok).toBe(false);
    expect(out.error.message).toMatch(/git add -A failed/);
    expect(out.error.stderr).toBe('permission denied');
  });

  it('returns the commit-failure error when git commit explodes', async () => {
    const { run, commit } = buildService();
    run
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail({ stderr: 'nothing to commit' }));
    const out = await commit({ rootPath: '/r' }, { message: 'x' });
    expect(out.ok).toBe(false);
    expect(out.error.message).toMatch(/git commit failed/);
    expect(out.error.stderr).toBe('nothing to commit');
  });
});
