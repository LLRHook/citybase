import { describe, expect, it, vi } from 'vitest';
import { CliAgentAdapter, defaultBuildArgv } from '../../electron/main/agents/CliAgentAdapter.cjs';

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
