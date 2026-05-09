import { describe, expect, it, vi } from 'vitest';
import { ClaudeAdapter, DEFAULT_MODEL } from '../../electron/main/agents/ClaudeAdapter.cjs';

const VALID_PARAMS = {
  questId: 'TASK-1',
  adventurerId: 'alpha-7',
  skill: 'refactor',
  repoUrl: '/abs/repo',
  branch: 'main',
  promptContext: 'do the thing',
};

function makeProcessService(overrides = {}) {
  return {
    run: vi.fn(async () => ({
      ok: true, code: 0, signal: null, stdout: '', stderr: '',
      timedOut: false, durationMs: 12, error: null,
    })),
    ...overrides,
  };
}

function makeAdapter(overrides = {}) {
  const processService = overrides.processService || makeProcessService();
  return new ClaudeAdapter({
    fsExists: () => false,
    readFileSync: () => '{}',
    claudePath: '/usr/local/bin/claude',
    now: () => Date.UTC(2026, 4, 9, 12, 0, 0),
    ...overrides,
    processService,
  });
}

describe('ClaudeAdapter — basic shape', () => {
  it('throws if processService.run is missing', () => {
    expect(() => new ClaudeAdapter({})).toThrow(/processService\.run is required/);
  });

  it('reports its name as "claude"', () => {
    expect(makeAdapter().name).toBe('claude');
  });

  it('exports a sane default model identifier', () => {
    expect(DEFAULT_MODEL).toMatch(/^claude-/);
  });
});

describe('ClaudeAdapter — claude CLI presence', () => {
  it('falls back to detectAgentBinaries when claudePath is not provided', async () => {
    const fsExists = vi.fn(() => false);
    const adapter = new ClaudeAdapter({
      processService: makeProcessService(),
      fsExists,
      claudePath: undefined,
    });
    await expect(adapter.startTask(VALID_PARAMS)).rejects.toThrow(/claude CLI not found on PATH/);
    expect(fsExists).toHaveBeenCalled();
  });

  it('uses an explicit claudePath without scanning PATH', async () => {
    const fsExists = vi.fn(() => false);
    const ps = makeProcessService();
    const adapter = new ClaudeAdapter({
      processService: ps,
      fsExists,
      claudePath: '/opt/custom/claude',
    });
    await adapter.startTask(VALID_PARAMS);
    expect(ps.run).toHaveBeenCalledWith(
      '/opt/custom/claude',
      expect.any(Array),
      expect.objectContaining({ cwd: '/abs/repo' }),
    );
    expect(fsExists).not.toHaveBeenCalled();
  });
});

describe('ClaudeAdapter — startTask', () => {
  it('validates params (rejects bad skill)', async () => {
    await expect(makeAdapter().startTask({ ...VALID_PARAMS, skill: 'magic' }))
      .rejects.toThrow(/skill must be one of/);
  });

  it('threads params.model through; defaults to Sonnet when absent', async () => {
    const ps = makeProcessService();
    const adapter = makeAdapter({ processService: ps });
    await adapter.startTask(VALID_PARAMS);
    let argv = ps.run.mock.calls.at(-1)[1];
    expect(argv).toContain('--model');
    expect(argv[argv.indexOf('--model') + 1]).toBe(DEFAULT_MODEL);

    ps.run.mockClear();
    await adapter.startTask({ ...VALID_PARAMS, model: 'claude-opus-4-7' });
    argv = ps.run.mock.calls.at(-1)[1];
    expect(argv[argv.indexOf('--model') + 1]).toBe('claude-opus-4-7');
  });

  it('builds an argv with --quiet and --prompt', async () => {
    const ps = makeProcessService();
    const adapter = makeAdapter({ processService: ps });
    await adapter.startTask(VALID_PARAMS);
    const argv = ps.run.mock.calls.at(-1)[1];
    expect(argv[0]).toBe('--quiet');
    expect(argv).toContain('--prompt');
    expect(argv).toContain('do the thing');
  });

  it('marks the run as done on a clean exit', async () => {
    const run = await makeAdapter().startTask(VALID_PARAMS);
    expect(run).toMatchObject({
      questId: 'TASK-1',
      adventurerId: 'alpha-7',
      status: 'done',
      contextUsed: 0,
      maxContext: 200_000,
      branch: 'main',
    });
    expect(run.runId).toMatch(/.+/);
  });

  it('marks the run as failed on a non-zero exit', async () => {
    const ps = makeProcessService({
      run: vi.fn(async () => ({
        ok: false, code: 1, signal: null, stdout: '', stderr: 'boom',
        timedOut: false, durationMs: 8, error: { message: 'exit 1', code: 1 },
      })),
    });
    const run = await makeAdapter({ processService: ps }).startTask(VALID_PARAMS);
    expect(run.status).toBe('failed');
  });
});

describe('ClaudeAdapter — streamEvents', () => {
  async function collect(it) {
    const out = [];
    for await (const v of it) out.push(v);
    return out;
  }

  it('emits events that name the binary as "claude"', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events.map(e => e.kind)).toEqual(['plan', 'edit', 'test', 'pr']);
    expect(events[0].text).toContain('claude');
    expect(events[0].text).not.toContain('codex');
  });

  it('emits an error event on a failed run', async () => {
    const ps = makeProcessService({
      run: vi.fn(async () => ({
        ok: false, code: 2, signal: null, stdout: '', stderr: '',
        timedOut: false, durationMs: 5, error: { message: 'exit 2', code: 2 },
      })),
    });
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events.at(-1).kind).toBe('error');
  });

  it('throws on unknown runId', async () => {
    await expect(collect(makeAdapter().streamEvents('nope')))
      .rejects.toThrow(/unknown runId/);
  });
});

describe('ClaudeAdapter — produceDiff / runChecks / openPR / cancel', () => {
  it('produceDiff invokes git diff inside the run cwd', async () => {
    const ps = makeProcessService();
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    await adapter.produceDiff(run.runId);
    const gitCalls = ps.run.mock.calls.filter(c => c[0] === 'git');
    expect(gitCalls).toHaveLength(1);
    expect(gitCalls[0][1]).toEqual(['diff', '--unified=3', '--no-color']);
  });

  it('runChecks runs declared npm scripts and forwards --run for test', async () => {
    const ps = makeProcessService();
    const pkg = JSON.stringify({ scripts: { lint: 'eslint .', test: 'vitest' } });
    const adapter = makeAdapter({ processService: ps, readFileSync: () => pkg });
    const run = await adapter.startTask(VALID_PARAMS);
    await adapter.runChecks(run.runId);
    const npmCalls = ps.run.mock.calls
      .filter(([cmd]) => cmd === 'npm')
      .map(([, argv]) => argv);
    expect(npmCalls.find(a => a[1] === 'lint')).toEqual(['run', 'lint', '--silent']);
    expect(npmCalls.find(a => a[1] === 'test')).toEqual(['run', 'test', '--silent', '--', '--run']);
  });

  it('openPR throws the Phase-5-deferred placeholder, named for claude', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    await expect(adapter.openPR(run.runId, {
      title: 't', body: 'b', sourceBranch: 'feat', targetBranch: 'main',
    })).rejects.toThrow(/openPR not yet supported by claudeAdapter.*Phase 5/);
  });

  it('cancel marks the run cancelled and is idempotent', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    await adapter.cancel(run.runId);
    await adapter.cancel(run.runId);
    const events = [];
    for await (const e of adapter.streamEvents(run.runId)) events.push(e);
    expect(events.at(-1).kind).toBe('error');
  });
});
