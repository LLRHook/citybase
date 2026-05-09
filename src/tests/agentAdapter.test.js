import { describe, expect, it } from 'vitest';
import {
  AgentAdapter,
  validateStartTaskParams,
  assertAgentEvent,
  SKILLS,
  AGENT_EVENT_KINDS,
} from '../../electron/main/agents/AgentAdapter.cjs';

describe('AgentAdapter base class', () => {
  it('exports the canonical skill set the contract allows', () => {
    expect([...SKILLS]).toEqual(['bugfix', 'refactor', 'tests', 'review', 'lint', 'docs']);
  });

  it('exports the canonical event-kind set the contract allows', () => {
    expect([...AGENT_EVENT_KINDS]).toEqual(['plan', 'edit', 'test', 'lint', 'pr', 'error']);
  });

  it('every method on the base throws "must be implemented"', async () => {
    const a = new AgentAdapter();
    expect(() => a.name).toThrow(/must be implemented/);
    await expect(a.startTask({})).rejects.toThrow(/startTask must be implemented/);
    expect(() => a.streamEvents('r')).toThrow(/streamEvents must be implemented/);
    await expect(a.reportUsage('r')).rejects.toThrow(/reportUsage must be implemented/);
    await expect(a.produceDiff('r')).rejects.toThrow(/produceDiff must be implemented/);
    await expect(a.runChecks('r')).rejects.toThrow(/runChecks must be implemented/);
    await expect(a.openPR('r', {})).rejects.toThrow(/openPR must be implemented/);
    await expect(a.cancel('r')).rejects.toThrow(/cancel must be implemented/);
  });

  it('a subclass can override every method and they no longer throw', async () => {
    class StubAdapter extends AgentAdapter {
      get name() { return 'stub'; }
      async startTask() { return { runId: '1', status: 'running', contextUsed: 0, maxContext: 200000, questId: 'q', adventurerId: 'a' }; }
      async *streamEvents() {}
      async reportUsage() { return { contextUsed: 0, maxContext: 200000 }; }
      async produceDiff() { return { files: [] }; }
      async runChecks() { return []; }
      async openPR() { return { prNumber: 1, url: '' }; }
      async cancel() { /* ok */ }
    }
    const a = new StubAdapter();
    expect(a.name).toBe('stub');
    await expect(a.startTask({})).resolves.toBeDefined();
    await expect(a.reportUsage('r')).resolves.toEqual({ contextUsed: 0, maxContext: 200000 });
  });
});

describe('validateStartTaskParams', () => {
  const valid = {
    questId: 'TASK-1',
    adventurerId: 'alpha-7',
    skill: 'refactor',
    repoUrl: '/abs/path',
    branch: 'main',
    promptContext: 'do the thing',
  };

  it('accepts a fully-populated params object', () => {
    expect(() => validateStartTaskParams(valid)).not.toThrow();
  });

  it('accepts an optional model override', () => {
    expect(() => validateStartTaskParams({ ...valid, model: 'claude-opus-4-7' })).not.toThrow();
  });

  it('rejects a missing or non-object payload', () => {
    expect(() => validateStartTaskParams(null)).toThrow(/params is required/);
    expect(() => validateStartTaskParams(undefined)).toThrow(/params is required/);
    expect(() => validateStartTaskParams(42)).toThrow(/params is required/);
  });

  it('rejects each missing required string field with a specific message', () => {
    for (const field of ['questId', 'adventurerId', 'repoUrl', 'branch', 'promptContext']) {
      const broken = { ...valid, [field]: '' };
      expect(() => validateStartTaskParams(broken)).toThrow(new RegExp(field));
    }
  });

  it('rejects skills outside the canonical set', () => {
    expect(() => validateStartTaskParams({ ...valid, skill: 'magic' })).toThrow(/skill must be one of/);
  });

  it('rejects an empty-string model override', () => {
    expect(() => validateStartTaskParams({ ...valid, model: '' })).toThrow(/model must be a non-empty string/);
  });
});

describe('assertAgentEvent', () => {
  const valid = { runId: 'r1', t: '12:34', kind: 'plan', text: 'doing the thing' };

  it('accepts and returns a fully-populated event', () => {
    expect(assertAgentEvent(valid)).toBe(valid);
  });

  it('accepts an optional payload', () => {
    expect(assertAgentEvent({ ...valid, payload: { foo: 'bar' } })).toBeDefined();
  });

  it('rejects events with the wrong shape', () => {
    expect(() => assertAgentEvent(null)).toThrow(/value must be an object/);
    expect(() => assertAgentEvent({ ...valid, runId: '' })).toThrow(/runId required/);
    expect(() => assertAgentEvent({ ...valid, t: '' })).toThrow(/t .*required/);
    expect(() => assertAgentEvent({ ...valid, kind: 'epic' })).toThrow(/kind must be one of/);
    expect(() => assertAgentEvent({ ...valid, text: '' })).toThrow(/text required/);
  });
});
