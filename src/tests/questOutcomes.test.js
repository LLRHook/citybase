import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createQuestOutcomes, MAX_FILE_BYTES } from '../../electron/main/agents/questOutcomes.cjs';
import { CodexAdapter } from '../../electron/main/agents/CodexAdapter.cjs';
import { ClaudeAdapter } from '../../electron/main/agents/ClaudeAdapter.cjs';
import { createAgentManager } from '../../electron/main/agents/agentManager.cjs';
import { sanitizeRun } from '../../electron/main/services/runStore.cjs';
import { run } from '../../electron/main/services/processService.cjs';

let cwd;
const proof = createQuestOutcomes({ run });
async function git(...args) {
  const result = await run('git', args, { cwd });
  if (!result.ok) throw new Error(result.stderr);
  return result.stdout;
}
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'citybase-quest-proof-'));
  await git('init', '-q');
  await fs.writeFile(path.join(cwd, 'city.txt'), 'market\nharbor\n');
  await git('add', 'city.txt');
  await git('-c', 'user.name=Victor Ivanov', '-c', 'user.email=vivanov@paradigmtesting.com', 'commit', '-qm', 'test: initialize quest proof');
});
afterEach(async () => { await fs.rm(cwd, { recursive: true, force: true }); });

describe('bounded repository progression proof', () => {
  it('credits actual edits and new files while preserving index bytes', async () => {
    const before = await proof.capture(cwd);
    await fs.writeFile(path.join(cwd, 'city.txt'), 'market\nlantern harbor\n');
    await fs.writeFile(path.join(cwd, 'welcome.txt'), 'Welcome\n');
    const indexPath = path.join(cwd, '.git', 'index');
    const index = await fs.readFile(indexPath);
    const outcome = await proof.verify({ questSkill: 'craft', successful: true, before, cwd });
    expect(outcome).toMatchObject({ kind: 'build', verified: true, filesChanged: 2, evidence: 'repository-fingerprint' });
    expect(outcome.before).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome.after).not.toBe(outcome.before);
    expect(await fs.readFile(indexPath)).toEqual(index);
    expect(JSON.stringify(outcome)).not.toContain('lantern harbor');
  });

  it('does not credit existing dirty work merely staged or committed by a run', async () => {
    await fs.writeFile(path.join(cwd, 'city.txt'), 'existing dirty harbor\n');
    const before = await proof.capture(cwd);
    await git('add', 'city.txt');
    const staged = await proof.verify({ questSkill: 'repair', successful: true, before, cwd });
    expect(staged.verified).toBe(false);
    await git('-c', 'user.name=Victor Ivanov', '-c', 'user.email=vivanov@paradigmtesting.com', 'commit', '-qm', 'test: commit existing work');
    expect((await proof.verify({ questSkill: 'repair', successful: true, before, cwd })).verified).toBe(false);
  });

  it('does not credit unchanged, failed or read-only crafting runs', async () => {
    const before = await proof.capture(cwd);
    expect((await proof.verify({ questSkill: 'craft', successful: true, before, cwd })).reason).toBe('no-repository-change');
    await fs.writeFile(path.join(cwd, 'city.txt'), 'changed\n');
    expect((await proof.verify({ questSkill: 'craft', successful: false, before, cwd })).verified).toBe(false);
    expect((await proof.verify({ questSkill: 'craft', successful: true, readOnly: true, before, cwd })).verified).toBe(false);
  });

  it('withholds credit on size limits and inspection failures', async () => {
    const before = await proof.capture(cwd);
    await fs.writeFile(path.join(cwd, 'large.bin'), Buffer.alloc(MAX_FILE_BYTES + 1));
    const outcome = await proof.verify({ questSkill: 'craft', successful: true, before, cwd });
    expect(outcome).toMatchObject({ verified: false, reason: 'inspection-limit' });
    const broken = createQuestOutcomes({ run: async () => { throw new Error('Git failed'); } });
    expect(await broken.capture(cwd)).toEqual({ ok: false, reason: 'inspection-unavailable' });
  });

  it('credits a real deletion but rejects symlink escapes', async () => {
    const before = await proof.capture(cwd);
    await fs.unlink(path.join(cwd, 'city.txt'));
    expect(await proof.verify({ questSkill: 'repair', successful: true, before, cwd })).toMatchObject({ verified: true, filesChanged: 1 });
    await fs.symlink('/etc/passwd', path.join(cwd, 'outside'));
    expect((await proof.verify({ questSkill: 'repair', successful: true, before, cwd })).verified).toBe(false);
  });
});

const params = () => ({ questId: 'q', adventurerId: 'mica', skill: 'review', questSkill: 'survey', readOnly: true, repoUrl: cwd, branch: 'main', promptContext: 'Scout the city' });
function streamingProcess(lines, result = { ok: true }) {
  return {
    run,
    spawnStream: (_command, _argv, options) => {
      for (const line of lines) options.onStdout(JSON.stringify(line) + '\n');
      return { kill: vi.fn(), done: Promise.resolve({ stdout: '', stderr: '', ...result }) };
    },
  };
}

describe('real-output scouting evidence', () => {
  it.each([
    ['Codex', CodexAdapter, { type: 'item.completed', item: { type: 'agent_message', text: 'The city has a market and harbor.' } }],
    ['Claude', ClaudeAdapter, { type: 'assistant', message: { content: [{ type: 'text', text: 'The city has a market and harbor.' }] } }],
  ])('%s requires actual assistant output and persists the verified skill outcome', async (_name, Adapter, message) => {
    const persisted = [];
    const adapter = new Adapter({ processService: streamingProcess([message]), binaryPath: '/fixture/provider' });
    const manager = createAgentManager({ adapters: { test: adapter }, persist: (records) => persisted.push(records.map(sanitizeRun)) });
    const task = await manager.startRun({ ...params(), provider: 'test' });
    await manager.getEvents(task.runId);
    await new Promise((resolve) => setImmediate(resolve));
    expect(task.status).toBe('done');
    expect(task.outcome).toEqual({ kind: 'scout', verified: true, filesChanged: 0, evidence: 'assistant-output' });
    const restored = createAgentManager({ initialRuns: persisted.at(-1) });
    expect(restored.listRuns()[0]).toMatchObject({ skill: 'review', questSkill: 'survey', adventurerId: 'mica', outcome: { verified: true } });
  });

  it.each([
    [[], { ok: true }],
    [[{ type: 'thread.started' }], { ok: true }],
    [[{ type: 'item.completed', item: { type: 'agent_message', text: '  ' } }], { ok: true }],
    [[{ type: 'item.completed', item: { type: 'agent_message', text: 'I started.' } }], { ok: false }],
  ])('withholds scouting credit for missing output or unsuccessful processes', async (lines, result) => {
    const adapter = new CodexAdapter({ processService: streamingProcess(lines, result), binaryPath: '/fixture/provider' });
    const task = await adapter.startTask(params());
    const events = adapter.streamEvents(task.runId);
    while (!(await events.next()).done) { /* wait for outcome */ }
    expect(task.outcome.verified).toBe(false);
  });

  it('keeps the run active until build proof settles, then publishes its outcome', async () => {
    let finishProof;
    const adapter = new CodexAdapter({
      processService: streamingProcess([]), binaryPath: '/fixture/provider',
      questOutcomes: { capture: async () => ({ ok: true }), verify: () => new Promise((resolve) => { finishProof = resolve; }) },
    });
    const emitEvent = vi.fn();
    const manager = createAgentManager({ adapters: { test: adapter }, emitEvent });
    const task = await manager.startRun({ ...params(), provider: 'test', questSkill: 'craft', readOnly: false });
    await new Promise((resolve) => setImmediate(resolve));
    expect(task.status).toBe('running');
    expect(emitEvent).not.toHaveBeenCalled();
    finishProof({ kind: 'build', verified: true, filesChanged: 1 });
    await manager.getEvents(task.runId);
    await new Promise((resolve) => setImmediate(resolve));
    expect(task).toMatchObject({ status: 'done', outcome: { verified: true, filesChanged: 1 } });
    expect(emitEvent.mock.calls.at(-1)[0]).toMatchObject({ runId: task.runId, event: { payload: { status: 'done' } } });
  });
});
