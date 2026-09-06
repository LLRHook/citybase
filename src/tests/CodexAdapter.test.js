import { describe, expect, it, vi } from 'vitest';
import { CodexAdapter, NOT_FOUND_MESSAGE } from '../../electron/main/agents/CodexAdapter.cjs';

const VALID_PARAMS = {
  questId: 'TASK-1',
  adventurerId: 'alpha-7',
  skill: 'refactor',
  repoUrl: '/abs/repo',
  branch: 'main',
  promptContext: 'do the thing',
};

// Non-blocking dispatch: startTask uses spawnStream; `run` is for git/gh/npm.
// Shape the agent run result via `streamResult`.
function makeProcessService(overrides = {}) {
  const streamResult = overrides.streamResult || {
    ok: true, code: 0, signal: null, stdout: '', stderr: '',
    timedOut: false, killed: false, truncated: false, durationMs: 12, error: null,
  };
  return {
    run: overrides.run || vi.fn(async () => ({
      ok: true, code: 0, signal: null, stdout: '', stderr: '',
      timedOut: false, durationMs: 12, error: null,
    })),
    spawnStream: overrides.spawnStream
      || vi.fn(() => ({ pid: 1, kill: vi.fn(), done: Promise.resolve(streamResult) })),
  };
}

async function settle(adapter, run) {
  const it = adapter.streamEvents(run.runId);
  while (!(await it.next()).done) { /* drain to force the run to settle */ }
  return run;
}

function makeAdapter(overrides = {}) {
  const processService = overrides.processService || makeProcessService();
  // Spread overrides first, then pin processService so the resolved
  // service (default or override) wins regardless of overrides shape.
  return new CodexAdapter({
    fsExists: () => false,
    readFileSync: () => '{}',
    codexPath: '/usr/local/bin/codex',
    now: () => Date.UTC(2026, 4, 9, 12, 0, 0),
    ...overrides,
    processService,
  });
}

describe('CodexAdapter — construction', () => {
  it('throws if processService.run is missing', () => {
    expect(() => new CodexAdapter({})).toThrow(/processService\.run is required/);
    expect(() => new CodexAdapter({ processService: {} })).toThrow(/processService\.run is required/);
  });

  it('reports its name as "codex"', () => {
    expect(makeAdapter().name).toBe('codex');
  });
});

describe('CodexAdapter — codex CLI presence', () => {
  it('falls back to detectAgentBinaries when codexPath is not provided', async () => {
    const fsExists = vi.fn(() => false);
    const adapter = new CodexAdapter({
      processService: makeProcessService(),
      fsExists,
      codexPath: undefined,
    });
    await expect(adapter.startTask(VALID_PARAMS)).rejects.toThrow(NOT_FOUND_MESSAGE);
    expect(fsExists).toHaveBeenCalled();
  });

  it('uses an explicit codexPath without scanning PATH', async () => {
    const fsExists = vi.fn(() => false);
    const ps = makeProcessService();
    const adapter = new CodexAdapter({
      processService: ps,
      fsExists,
      codexPath: '/opt/custom/codex',
    });
    await adapter.startTask(VALID_PARAMS);
    expect(ps.spawnStream).toHaveBeenCalledWith(
      '/opt/custom/codex',
      expect.any(Array),
      expect.objectContaining({ cwd: '/abs/repo' }),
    );
    expect(fsExists).not.toHaveBeenCalled();
  });
});

describe('CodexAdapter — startTask', () => {
  it('validates params via the contract validator (rejects bad skill)', async () => {
    const adapter = makeAdapter();
    await expect(adapter.startTask({ ...VALID_PARAMS, skill: 'magic' }))
      .rejects.toThrow(/skill must be one of/);
  });

  it('builds an argv that runs `codex exec` with the prompt piped via stdin', async () => {
    const ps = makeProcessService();
    const adapter = makeAdapter({ processService: ps });
    await adapter.startTask({ ...VALID_PARAMS, model: 'gpt-5-codex' });
    const [, args, options] = ps.spawnStream.mock.calls[0];
    expect(args[0]).toBe('exec');
    expect(args).toContain('--json');
    expect(args).toContain('--cd');
    expect(args).toContain('/abs/repo');
    expect(args).toContain('--sandbox');
    expect(args).toContain('workspace-write');
    expect(args).toContain('--model');
    expect(args).toContain('gpt-5-codex');
    // Trailing `-` makes codex exec read the prompt from stdin.
    expect(args.at(-1)).toBe('-');
    // The prompt body (with the skill prefix) lands on stdin.
    expect(typeof options.stdin).toBe('string');
    expect(options.stdin).toContain('do the thing');
  });

  it('returns AgentRun shape running, then done on a clean exit', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    expect(run).toMatchObject({
      questId: 'TASK-1',
      adventurerId: 'alpha-7',
      contextUsed: 0,
      maxContext: 200_000,
      branch: 'main',
    });
    expect(typeof run.runId).toBe('string');
    expect(run.runId.length).toBeGreaterThan(0);
    await settle(adapter, run);
    expect(run.status).toBe('done');
  });

  it('marks the run as failed when the process reports a non-zero exit', async () => {
    const ps = makeProcessService({
      streamResult: {
        ok: false, code: 1, signal: null, stdout: 'partial', stderr: 'boom',
        timedOut: false, killed: false, truncated: false, durationMs: 8, error: { message: 'exit 1', code: 1 },
      },
    });
    const adapter = makeAdapter({ processService: ps });
    const run = await settle(adapter, await adapter.startTask(VALID_PARAMS));
    expect(run.status).toBe('failed');
  });

  it('marks the run as failed when the process times out', async () => {
    const ps = makeProcessService({
      streamResult: {
        ok: false, code: null, signal: 'SIGTERM', stdout: '', stderr: '',
        timedOut: true, killed: true, truncated: false, durationMs: 15000, error: { message: 'ETIMEDOUT' },
      },
    });
    const adapter = makeAdapter({ processService: ps });
    const run = await settle(adapter, await adapter.startTask(VALID_PARAMS));
    expect(run.status).toBe('failed');
  });
});

describe('CodexAdapter — streamEvents', () => {
  async function collect(it) {
    const out = [];
    for await (const v of it) out.push(v);
    return out;
  }

  it('throws on unknown runId', async () => {
    const adapter = makeAdapter();
    await expect(collect(adapter.streamEvents('nope')))
      .rejects.toThrow(/unknown runId: nope/);
  });

  it('streams actual messages and changed paths before the process exits', async () => {
    let stdout;
    let finish;
    const ps = makeProcessService({ spawnStream: vi.fn((_cmd, _args, options) => {
      stdout = options.onStdout;
      return { kill: vi.fn(), done: new Promise((resolve) => { finish = resolve; }) };
    }) });
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    const iterator = adapter.streamEvents(run.runId);
    const first = iterator.next();
    stdout('{"type":"thread.star');
    stdout('ted","thread_id":"real-thread"}\n');
    expect((await first).value.text).toBe('codex: session started');
    expect(run.status).toBe('running');
    stdout(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'I inspected city.js.' } }) + '\n');
    stdout(JSON.stringify({ type: 'item.completed', item: { type: 'file_change', status: 'completed', changes: [{ path: '/abs/repo/city.js', kind: 'update' }] } }) + '\n');
    stdout(JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'private reasoning' } }) + '\n');
    stdout(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 30, output_tokens: 12 } }));
    finish({ ok: true, stdout: '', stderr: '' });
    const rest = await collect(iterator);
    expect(rest.map((event) => event.text)).toEqual(['codex: I inspected city.js.', 'codex: changed /abs/repo/city.js', 'codex: turn completed']);
    expect(rest[1].payload.path).toBe('/abs/repo/city.js');
    expect(run.contextUsed).toBe(42);
    expect(run.status).toBe('done');
  });

  it('uses the terminal JSON failure even if the process exits zero', async () => {
    const ps = makeProcessService({ spawnStream: vi.fn((_cmd, _args, options) => {
      options.onStdout('{"type":"turn.failed","error":{"message":"quota unavailable"}}\n');
      return { kill: vi.fn(), done: Promise.resolve({ ok: true, stdout: '', stderr: '' }) };
    }) });
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(run.status).toBe('failed');
    expect(events[0]).toMatchObject({ kind: 'error', text: 'codex: quota unavailable' });
  });

  it('enforces a read-only sandbox for a scouting run', async () => {
    const ps = makeProcessService();
    const adapter = makeAdapter({ processService: ps });
    await adapter.startTask({ ...VALID_PARAMS, skill: 'review', readOnly: true });
    const args = ps.spawnStream.mock.calls[0][1];
    expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only');
  });

  it('reports an empty process exit without inventing edits, checks or PRs', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events.map(e => e.kind)).toEqual(['plan']);
    expect(events[0].text).toBe('codex: process exited without structured output');
    for (const e of events) {
      expect(e.runId).toBe(run.runId);
      expect(e.t).toMatch(/^\d{2}:\d{2}$/);
      expect(typeof e.text).toBe('string');
    }
  });

  it('emits an error event on a failed run', async () => {
    const ps = makeProcessService({
      streamResult: {
        ok: false, code: 2, signal: null, stdout: '', stderr: '',
        timedOut: false, killed: false, truncated: false, durationMs: 5, error: { message: 'exit 2', code: 2 },
      },
    });
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events.at(-1).kind).toBe('error');
  });

  it('emits a cancelled trail after cancel()', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    await adapter.cancel(run.runId);
    const events = await collect(adapter.streamEvents(run.runId));
    expect(events.at(-1).kind).toBe('error');
    expect(events.at(-1).text).not.toContain('completed');
  });
});

describe('CodexAdapter — reportUsage', () => {
  it('returns the placeholder { contextUsed, maxContext } envelope', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    expect(await adapter.reportUsage(run.runId)).toEqual({ contextUsed: 0, maxContext: 200_000 });
  });

  it('throws on unknown runId', async () => {
    await expect(makeAdapter().reportUsage('nope')).rejects.toThrow(/unknown runId/);
  });
});

describe('CodexAdapter — produceDiff', () => {
  it('runs git diff inside the run cwd and parses the result', async () => {
    const diffStdout = [
      'diff --git a/x.js b/x.js',
      '--- a/x.js',
      '+++ b/x.js',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
    ].join('\n');
    const ps = makeProcessService({
      run: vi.fn(async (cmd, args) => ({
        ok: true, code: 0, signal: null,
        // ls-files (untracked probe) returns nothing; diff returns the change.
        stdout: cmd === 'git' && args[0] === 'diff' ? diffStdout : '',
        stderr: '', timedOut: false, durationMs: 5, error: null,
      })),
    });
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    const out = await adapter.produceDiff(run.runId);
    const diffCall = ps.run.mock.calls.find(c => c[0] === 'git' && c[1][0] === 'diff');
    expect(diffCall[1]).toEqual(['diff', '--unified=3', '--no-color']);
    expect(diffCall[2]).toEqual({ cwd: '/abs/repo' });
    expect(out.files).toHaveLength(1);
    expect(out.files[0].file).toBe('x.js');
  });

  it('returns { files: [] } when git refuses without producing stdout', async () => {
    const ps = makeProcessService({
      run: vi.fn(async (cmd) => (cmd === 'git'
        ? { ok: false, code: 128, signal: null, stdout: '', stderr: 'not a repo', timedOut: false, durationMs: 1, error: { message: 'exit 128' } }
        : { ok: true, code: 0, signal: null, stdout: '', stderr: '', timedOut: false, durationMs: 5, error: null }
      )),
    });
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    expect(await adapter.produceDiff(run.runId)).toEqual({ files: [] });
  });
});

describe('CodexAdapter — runChecks', () => {
  it('returns [] when package.json is missing', async () => {
    const adapter = makeAdapter({
      readFileSync: () => { throw new Error('ENOENT'); },
    });
    const run = await adapter.startTask(VALID_PARAMS);
    expect(await adapter.runChecks(run.runId)).toEqual([]);
  });

  it('runs the npm scripts that exist and reports pass/fail with meta', async () => {
    const ps = makeProcessService({
      run: vi.fn(async (cmd, args) => {
        if (cmd === 'npm' && args[1] === 'lint') {
          return { ok: true, code: 0, signal: null, stdout: '', stderr: '', timedOut: false, durationMs: 80, error: null };
        }
        if (cmd === 'npm' && args[1] === 'test') {
          return { ok: false, code: 1, signal: null, stdout: '', stderr: '', timedOut: false, durationMs: 200, error: { message: 'exit 1' } };
        }
        // codex startTask call
        return { ok: true, code: 0, signal: null, stdout: '', stderr: '', timedOut: false, durationMs: 10, error: null };
      }),
    });
    const pkg = JSON.stringify({ scripts: { lint: 'eslint .', test: 'vitest' } });
    const adapter = makeAdapter({
      processService: ps,
      readFileSync: () => pkg,
    });
    const run = await adapter.startTask(VALID_PARAMS);
    const checks = await adapter.runChecks(run.runId);
    expect(checks).toEqual([
      { name: 'lint · npm run lint', state: 'pass', meta: 'clean in 80ms' },
      { name: 'test · npm run test', state: 'fail', meta: 'exited 1' },
    ]);
  });

  it('skips scripts the project does not define', async () => {
    const ps = makeProcessService();
    const pkg = JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } });
    const adapter = makeAdapter({ processService: ps, readFileSync: () => pkg });
    const run = await adapter.startTask(VALID_PARAMS);
    const checks = await adapter.runChecks(run.runId);
    expect(checks.map(c => c.name)).toEqual(['typecheck · npm run typecheck']);
  });

  it('reports timeout with a meta string when a script times out', async () => {
    const ps = makeProcessService({
      run: vi.fn(async (cmd, args) => {
        if (cmd === 'npm' && args[1] === 'lint') {
          return { ok: false, code: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true, durationMs: 15_000, error: { message: 'ETIMEDOUT' } };
        }
        return { ok: true, code: 0, signal: null, stdout: '', stderr: '', timedOut: false, durationMs: 10, error: null };
      }),
    });
    const pkg = JSON.stringify({ scripts: { lint: 'eslint .' } });
    const adapter = makeAdapter({ processService: ps, readFileSync: () => pkg });
    const run = await adapter.startTask(VALID_PARAMS);
    const checks = await adapter.runChecks(run.runId);
    expect(checks[0]).toEqual({ name: 'lint · npm run lint', state: 'fail', meta: 'timed out after 15000ms' });
  });

  it('passes "-- --run" only for the test script so Vitest does not enter watch mode', async () => {
    const ps = makeProcessService();
    const pkg = JSON.stringify({ scripts: { lint: 'eslint .', test: 'vitest', typecheck: 'tsc --noEmit' } });
    const adapter = makeAdapter({ processService: ps, readFileSync: () => pkg });
    const run = await adapter.startTask(VALID_PARAMS);
    await adapter.runChecks(run.runId);
    const npmCalls = ps.run.mock.calls
      .filter(([cmd]) => cmd === 'npm')
      .map(([, argv]) => argv);
    const lint = npmCalls.find(a => a[1] === 'lint');
    const test = npmCalls.find(a => a[1] === 'test');
    const typecheck = npmCalls.find(a => a[1] === 'typecheck');
    expect(lint).toEqual(['run', 'lint', '--silent']);
    expect(test).toEqual(['run', 'test', '--silent', '--', '--run']);
    expect(typecheck).toEqual(['run', 'typecheck', '--silent']);
  });
});

describe('CodexAdapter — openPR + cancel', () => {
  it('openPR shells out to gh and returns { prNumber, url }', async () => {
    const ps = makeProcessService();
    const adapter = makeAdapter({ processService: ps });
    const run = await adapter.startTask(VALID_PARAMS);
    ps.run.mockClear();
    ps.run.mockResolvedValueOnce({
      ok: true, code: 0, signal: null,
      stdout: 'https://github.com/owner/repo/pull/13\n',
      stderr: '', timedOut: false, durationMs: 9, error: null,
    });
    const out = await adapter.openPR(run.runId, {
      title: 't', body: 'b', sourceBranch: 'feat', targetBranch: 'main',
    });
    expect(out).toEqual({ prNumber: 13, url: 'https://github.com/owner/repo/pull/13' });
    expect(ps.run.mock.calls[0][0]).toBe('gh');
  });

  it('cancel marks the run cancelled and is idempotent', async () => {
    const adapter = makeAdapter();
    const run = await adapter.startTask(VALID_PARAMS);
    await adapter.cancel(run.runId);
    await adapter.cancel(run.runId); // no throw on second call
    // streamEvents reflects the cancellation
    const events = [];
    for await (const e of adapter.streamEvents(run.runId)) events.push(e);
    expect(events.at(-1).kind).toBe('error');
  });

  it('cancel throws on unknown runId', async () => {
    await expect(makeAdapter().cancel('nope')).rejects.toThrow(/unknown runId/);
  });
});
