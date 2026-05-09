import { describe, expect, it, vi } from 'vitest';
import {
  ClaudeAdapter,
  DEFAULT_MODEL,
  buildClaudeArgv,
  parseClaudeJsonResult,
} from '../../electron/main/agents/ClaudeAdapter.cjs';

const VALID_PARAMS = {
  questId: 'TASK-1',
  adventurerId: 'alpha-7',
  skill: 'refactor',
  repoUrl: '/abs/repo',
  branch: 'main',
  promptContext: 'do the thing',
};

// A realistic stdout envelope from `claude --print --output-format json`.
const SUCCESS_STDOUT = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 1234,
  num_turns: 1,
  result: 'I refactored the file as you asked.',
  session_id: 's-1',
  usage: { input_tokens: 100, output_tokens: 200 },
});

const ERROR_STDOUT = JSON.stringify({
  type: 'result',
  subtype: 'error',
  is_error: true,
  result: 'rate limit hit; please retry later',
});

function makeProcessService(overrides = {}) {
  return {
    run: vi.fn(async () => ({
      ok: true, code: 0, signal: null, stdout: SUCCESS_STDOUT, stderr: '',
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

describe('ClaudeAdapter — buildClaudeArgv (real Claude CLI flags)', () => {
  it('uses --print and --output-format json (NOT --quiet/--prompt)', () => {
    const argv = buildClaudeArgv({ params: VALID_PARAMS });
    expect(argv).toContain('--print');
    expect(argv[argv.indexOf('--output-format') + 1]).toBe('json');
    expect(argv).not.toContain('--quiet');
    expect(argv).not.toContain('--prompt');
  });

  it('passes the prompt as a positional argument (last item)', () => {
    const argv = buildClaudeArgv({ params: { ...VALID_PARAMS, promptContext: 'fix the build' } });
    expect(argv.at(-1)).toBe('fix the build');
  });

  it('threads --model through with a sane default', () => {
    expect(buildClaudeArgv({ params: VALID_PARAMS })[
      buildClaudeArgv({ params: VALID_PARAMS }).indexOf('--model') + 1
    ]).toBe(DEFAULT_MODEL);
    const overridden = buildClaudeArgv({ params: { ...VALID_PARAMS, model: 'claude-opus-4-7' } });
    expect(overridden[overridden.indexOf('--model') + 1]).toBe('claude-opus-4-7');
  });

  it('sets --permission-mode bypassPermissions for non-interactive runs', () => {
    const argv = buildClaudeArgv({ params: VALID_PARAMS });
    expect(argv[argv.indexOf('--permission-mode') + 1]).toBe('bypassPermissions');
  });
});

describe('ClaudeAdapter — startTask', () => {
  it('validates params (rejects bad skill)', async () => {
    await expect(makeAdapter().startTask({ ...VALID_PARAMS, skill: 'magic' }))
      .rejects.toThrow(/skill must be one of/);
  });

  it('passes the configured argv to processService.run', async () => {
    const ps = makeProcessService();
    const adapter = makeAdapter({ processService: ps });
    await adapter.startTask(VALID_PARAMS);
    const argv = ps.run.mock.calls.at(-1)[1];
    expect(argv[0]).toBe('--print');
    expect(argv).toContain('do the thing');
    expect(argv).not.toContain('--quiet');
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

describe('ClaudeAdapter — streamEvents (real CLI output, no synthetic trail)', () => {
  async function collect(it) {
    const out = [];
    for await (const v of it) out.push(v);
    return out;
  }

  it('yields a single edit event with the parsed result text', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('edit');
    expect(events[0].text).toBe('claude: I refactored the file as you asked.');
    expect(events[0].runId).toBe(run.runId);
    expect(events[0].t).toMatch(/^\d{2}:\d{2}$/);
  });

  it('yields an error event when claude reports is_error in the JSON envelope', async () => {
    const ps = makeProcessService({
      run: vi.fn(async () => ({
        ok: true, code: 0, signal: null, stdout: ERROR_STDOUT, stderr: '',
        timedOut: false, durationMs: 12, error: null,
      })),
    });
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('error');
    expect(events[0].text).toContain('rate limit hit');
  });

  it('yields an error event when the process exits non-zero', async () => {
    const ps = makeProcessService({
      run: vi.fn(async () => ({
        ok: false, code: 2, signal: null, stdout: '', stderr: 'fatal: claude died',
        timedOut: false, durationMs: 5, error: { message: 'exit 2', code: 2 },
      })),
    });
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('error');
    expect(events[0].text).toContain('fatal: claude died');
  });

  it('yields an error event with the timeout message when the run timed out', async () => {
    const ps = makeProcessService({
      run: vi.fn(async () => ({
        ok: false, code: null, signal: null, stdout: '', stderr: '',
        timedOut: true, durationMs: 15_000, error: { message: 'timed out', code: 'ETIMEDOUT' },
      })),
    });
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events.at(-1).kind).toBe('error');
    expect(events.at(-1).text).toMatch(/timed out/);
  });

  it('yields a cancelled-error event for cancelled runs', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    await adapter.cancel(run.runId);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events.at(-1).kind).toBe('error');
    expect(events.at(-1).text).toMatch(/cancelled/);
  });

  it('throws on unknown runId', async () => {
    await expect(collect(makeAdapter().streamEvents('nope')))
      .rejects.toThrow(/unknown runId/);
  });
});

describe('parseClaudeJsonResult', () => {
  it('returns the result text from a success envelope', () => {
    const out = parseClaudeJsonResult(SUCCESS_STDOUT);
    expect(out).toMatchObject({ ok: true, isError: false });
    expect(out.text).toBe('I refactored the file as you asked.');
  });

  it('flags is_error and surfaces the result text as the error message', () => {
    const out = parseClaudeJsonResult(ERROR_STDOUT);
    expect(out.ok).toBe(false);
    expect(out.isError).toBe(true);
    expect(out.text).toContain('rate limit hit');
  });

  it('treats non-JSON stdout as plain text (claude can fail before printing JSON)', () => {
    const out = parseClaudeJsonResult('Error: not authenticated; run `claude login`');
    expect(out.text).toMatch(/not authenticated/);
  });

  it('returns an error envelope for empty or non-string input', () => {
    expect(parseClaudeJsonResult('')).toMatchObject({ ok: false, isError: true });
    expect(parseClaudeJsonResult(null)).toMatchObject({ ok: false, isError: true });
    expect(parseClaudeJsonResult(undefined)).toMatchObject({ ok: false, isError: true });
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
