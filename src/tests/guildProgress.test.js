import { describe, it, expect } from 'vitest';
import { claimReward, rewardFor, agentProgress } from '../city/guildProgress.js';
const scout = { runId: 'one', provider: 'claude', adventurerId: 'juniper', questSkill: 'survey', status: 'done', readOnly: true, outcome: { verified: true } };
describe('guild progression from verified quests', () => {
  it('awards a field report once even after history reload', () => {
    const claimed = claimReward({ receipts: [] }, scout);
    expect(claimed.receipts).toHaveLength(1);
    expect(claimReward(JSON.parse(JSON.stringify(claimed)), scout)).toEqual(claimed);
    expect(agentProgress(claimed, 'juniper').skills.survey).toBe(40);
    expect(agentProgress(claimed, 'mica').xp).toBe(0);
  });
  it('never gives credit for failed, unverified, or read-only building runs', () => {
    expect(rewardFor({ ...scout, status: 'failed' })).toBeNull();
    expect(rewardFor({ ...scout, outcome: { verified: false } })).toBeNull();
    expect(rewardFor({ ...scout, questSkill: 'craft' })).toBeNull();
    expect(rewardFor({ ...scout, outcome: undefined })).toBeNull();
  });
  it('levels the selected adventurer at 100XP and keeps distinct skills', () => {
    let progress = claimReward({ receipts: [] }, scout);
    progress = claimReward(progress, { ...scout, runId: 'two', questSkill: 'craft', readOnly: false });
    expect(agentProgress(progress, 'juniper')).toEqual({ xp: 100, level: 2, nextLevel: 0, skills: { survey: 40, craft: 60, repair: 0 } });
  });
});
