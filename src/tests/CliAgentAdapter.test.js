import { describe, expect, it, vi } from 'vitest';
import {
  CliAgentAdapter,
  defaultBuildArgv,
  parseGhPrCreateUrl,
  parsePrNumberFromUrl,
} from '../../electron/main/agents/CliAgentAdapter.cjs';

const VALID = {
  questId: 'TASK-1',
  adventurerId: 'alpha-7',
  skill: 'refactor',
  repoUrl: '/abs/repo',
  branch: 'main',
  promptContext: 'do the thing',
};

function makeProcessService() {
  return {
    run: vi.fn(async () => ({
      ok: true, code: 0, signal: null, stdout: '', stderr: '',
      timedOut: false, durationMs: 10, error: null,
    })),
  };
}

describe('CliAgentAdapter — required construction options', () => {
  it('throws when binaryName is missing', () => {
    expect(() => new CliAgentAdapter({ detectKey: 'codex', processService: makeProcessService() }))
      .toThrow(/binaryName is required/);
  });

  it('throws when detectKey is missing', () => {
    expect(() => new CliAgentAdapter({ binaryName: 'codex', processService: makeProcessService() }))
      .toThrow(/detectKey is required/);
  });

  it('throws with a binary-specific message when processService is missing', () => {
    expect(() => new CliAgentAdapter({ binaryName: 'codex', detectKey: 'codex' }))
      .toThrow(/codexAdapter: processService\.run is required/);
  });
});

describe('CliAgentAdapter — buildArgv contract', () => {
  it('uses defaultBuildArgv when none is supplied', async () => {
    const ps = makeProcessService();
    const adapter = new CliAgentAdapter({
      binaryName: 'codex',
      detectKey: 'codex',
      processService: ps,
      binaryPath: '/usr/local/bin/codex',
    });
    await adapter.startTask({ ...VALID, model: 'opus' });
    const argv = ps.run.mock.calls[0][1];
    expect(argv).toEqual(['--quiet', '--prompt', 'do the thing', '--model', 'opus']);
  });

  it('throws if a custom buildArgv returns something other than an array', async () => {
    const ps = makeProcessService();
    const adapter = new CliAgentAdapter({
      binaryName: 'codex',
      detectKey: 'codex',
      processService: ps,
      binaryPath: '/usr/local/bin/codex',
      buildArgv: () => 'oops, a string',
    });
    await expect(adapter.startTask(VALID)).rejects.toThrow(/buildArgv must return a string array/);
  });

  it('passes params and skill into a custom buildArgv', async () => {
    const ps = makeProcessService();
    const buildArgv = vi.fn(({ params, skill }) => {
      expect(skill).toBe(params.skill);
      return ['--bespoke', skill];
    });
    const adapter = new CliAgentAdapter({
      binaryName: 'codex',
      detectKey: 'codex',
      processService: ps,
      binaryPath: '/usr/local/bin/codex',
      buildArgv,
    });
    await adapter.startTask(VALID);
    expect(buildArgv).toHaveBeenCalledWith(expect.objectContaining({ params: expect.any(Object), skill: 'refactor' }));
    expect(ps.run.mock.calls[0][1]).toEqual(['--bespoke', 'refactor']);
  });
});

describe('defaultBuildArgv', () => {
  it('omits --model when params.model is absent', () => {
    expect(defaultBuildArgv({ params: { promptContext: 'P' } }))
      .toEqual(['--quiet', '--prompt', 'P']);
  });

  it('appends --model when params.model is provided', () => {
    expect(defaultBuildArgv({ params: { promptContext: 'P', model: 'opus' } }))
      .toEqual(['--quiet', '--prompt', 'P', '--model', 'opus']);
  });
});

describe('parseGhPrCreateUrl', () => {
  it('extracts the PR URL from typical multi-line gh output', () => {
    const stdout = [
      'Creating pull request for feature/x into main in owner/repo',
      '',
      'https://github.com/owner/repo/pull/123',
      '',
    ].join('\n');
    expect(parseGhPrCreateUrl(stdout)).toBe('https://github.com/owner/repo/pull/123');
  });

  it('extracts the URL even with a trailing query string or fragment', () => {
    const stdout = 'https://github.com/owner/repo/pull/42?foo=bar\n';
    expect(parseGhPrCreateUrl(stdout)).toBe('https://github.com/owner/repo/pull/42?foo=bar');
  });

  it('returns null when no URL is present in stdout', () => {
    expect(parseGhPrCreateUrl('Creating pull request...\n(no url)\n')).toBeNull();
    expect(parseGhPrCreateUrl('')).toBeNull();
    expect(parseGhPrCreateUrl(null)).toBeNull();
    expect(parseGhPrCreateUrl(undefined)).toBeNull();
  });
});

describe('parsePrNumberFromUrl', () => {
  it('returns the trailing pull number as an integer', () => {
    expect(parsePrNumberFromUrl('https://github.com/owner/repo/pull/123')).toBe(123);
    expect(parsePrNumberFromUrl('https://github.com/owner/repo/pull/9999/files')).toBe(9999);
  });

  it('returns null for non-PR URLs or non-strings', () => {
    expect(parsePrNumberFromUrl('https://github.com/owner/repo')).toBeNull();
    expect(parsePrNumberFromUrl('not a url')).toBeNull();
    expect(parsePrNumberFromUrl(null)).toBeNull();
  });
});

describe('CliAgentAdapter — openPR via gh CLI', () => {
  function makeRunningAdapter({ runResult } = {}) {
    const run = vi.fn(async () => runResult || ({
      ok: true, code: 0, signal: null,
      stdout: 'https://github.com/owner/repo/pull/77\n',
      stderr: '', timedOut: false, durationMs: 12, error: null,
    }));
    const ps = { run };
    const adapter = new CliAgentAdapter({
      binaryName: 'codex',
      detectKey: 'codex',
      processService: ps,
      fsExists: () => false,
      readFileSync: () => '{}',
      binaryPath: '/usr/local/bin/codex',
    });
    return { adapter, ps, run };
  }

  async function withStartedRun(adapter) {
    return adapter.startTask(VALID);
  }

  it('throws on unknown runId', async () => {
    const { adapter } = makeRunningAdapter();
    await expect(adapter.openPR('nope', { title: 't', sourceBranch: 's', targetBranch: 'main' }))
      .rejects.toThrow(/unknown runId/);
  });

  it('rejects missing or empty title / sourceBranch / targetBranch', async () => {
    const { adapter } = makeRunningAdapter();
    const r = await withStartedRun(adapter);
    await expect(adapter.openPR(r.runId)).rejects.toThrow(/params is required/);
    await expect(adapter.openPR(r.runId, { sourceBranch: 's', targetBranch: 'main' }))
      .rejects.toThrow(/title must be a non-empty string/);
    await expect(adapter.openPR(r.runId, { title: 't', targetBranch: 'main' }))
      .rejects.toThrow(/sourceBranch must be a non-empty string/);
    await expect(adapter.openPR(r.runId, { title: 't', sourceBranch: 's' }))
      .rejects.toThrow(/targetBranch must be a non-empty string/);
  });

  it('shells out to `gh pr create` with the right argv inside the run cwd', async () => {
    const { adapter, ps } = makeRunningAdapter();
    const r = await withStartedRun(adapter);
    ps.run.mockClear();
    ps.run.mockResolvedValueOnce({
      ok: true, code: 0, signal: null,
      stdout: 'https://github.com/owner/repo/pull/77\n',
      stderr: '', timedOut: false, durationMs: 8, error: null,
    });
    const out = await adapter.openPR(r.runId, {
      title: 'feat: thing', body: 'why', sourceBranch: 'feat/x', targetBranch: 'main',
    });
    expect(out).toEqual({ prNumber: 77, url: 'https://github.com/owner/repo/pull/77' });
    expect(ps.run).toHaveBeenCalledTimes(1);
    expect(ps.run.mock.calls[0][0]).toBe('gh');
    expect(ps.run.mock.calls[0][1]).toEqual([
      'pr', 'create',
      '--title', 'feat: thing',
      '--body', 'why',
      '--base', 'main',
      '--head', 'feat/x',
    ]);
    expect(ps.run.mock.calls[0][2]).toEqual({ cwd: '/abs/repo' });
  });

  it('defaults body to empty string when omitted', async () => {
    const { adapter, ps } = makeRunningAdapter();
    const r = await withStartedRun(adapter);
    ps.run.mockClear();
    ps.run.mockResolvedValueOnce({
      ok: true, code: 0, signal: null,
      stdout: 'https://github.com/owner/repo/pull/1\n',
      stderr: '', timedOut: false, durationMs: 5, error: null,
    });
    await adapter.openPR(r.runId, { title: 't', sourceBranch: 's', targetBranch: 'main' });
    const argv = ps.run.mock.calls[0][1];
    const i = argv.indexOf('--body');
    expect(argv[i + 1]).toBe('');
  });

  it('throws with stderr message when gh pr create exits non-zero', async () => {
    const { adapter, ps } = makeRunningAdapter();
    const r = await withStartedRun(adapter);
    ps.run.mockClear();
    ps.run.mockResolvedValueOnce({
      ok: false, code: 1, signal: null, stdout: '',
      stderr: 'pull request create failed: GraphQL: must have admin rights',
      timedOut: false, durationMs: 6, error: { message: 'exit 1', code: 1 },
    });
    await expect(adapter.openPR(r.runId, {
      title: 't', sourceBranch: 's', targetBranch: 'main',
    })).rejects.toThrow(/gh pr create failed.*GraphQL: must have admin rights/);
  });

  it('throws when gh pr create succeeds but no URL is in stdout', async () => {
    const { adapter, ps } = makeRunningAdapter();
    const r = await withStartedRun(adapter);
    ps.run.mockClear();
    ps.run.mockResolvedValueOnce({
      ok: true, code: 0, signal: null,
      stdout: 'Creating pull request...\n',
      stderr: '', timedOut: false, durationMs: 5, error: null,
    });
    await expect(adapter.openPR(r.runId, {
      title: 't', sourceBranch: 's', targetBranch: 'main',
    })).rejects.toThrow(/no PR URL/);
  });
});
