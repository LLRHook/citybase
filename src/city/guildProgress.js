// These are game records, not changes to the providers or their models.
export const ADVENTURERS = [
  { id: 'juniper', name: 'Juniper', provider: 'claude', role: 'The thoughtful pathfinder', color: '#c7764c' },
  { id: 'mica', name: 'Mica', provider: 'codex', role: 'The curious tinkerer', color: '#6697a3' },
];
export const QUEST_SKILLS = [
  { id: 'survey', label: 'Surveying', short: 'Survey', icon: 'compass', xp: 40, readOnly: true, description: 'Read the world. Return with a field report.' },
  { id: 'craft', label: 'Crafting', short: 'Craft', icon: 'home', xp: 60, readOnly: false, description: 'Make something new in the real project.' },
  { id: 'repair', label: 'Mending', short: 'Mend', icon: 'refresh', xp: 60, readOnly: false, description: 'Find a problem. Leave things a little better.' },
];
export function loadGuild(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(`citybase:guild:${id}`) || '{}');
    return { receipts: Array.isArray(saved.receipts) ? saved.receipts.filter(r => r && typeof r.runId === 'string' && QUEST_SKILLS.some(s => s.id === r.skill) && ADVENTURERS.some(a => a.id === r.agent) && Number.isFinite(r.xp)) : [] };
  } catch { return { receipts: [] }; }
}
export function rewardFor(run) {
  if (!run || run.status !== 'done' || run.outcome?.verified !== true) return null;
  const skill = QUEST_SKILLS.find(s => s.id === run.questSkill);
  const agent = ADVENTURERS.find(a => a.id === run.adventurerId) || ADVENTURERS.find(a => a.provider === run.provider);
  if (!skill || !agent || (run.readOnly && !skill.readOnly)) return null;
  return { runId: run.runId, agent: agent.id, skill: skill.id, xp: skill.xp };
}
export function claimReward(progress, run) {
  const reward = rewardFor(run);
  if (!reward || progress.receipts.some(r => r.runId === run.runId)) return progress;
  return { receipts: [...progress.receipts, reward] };
}
export function agentProgress(progress, agentId) {
  const receipts = progress.receipts.filter(r => r.agent === agentId);
  const xp = receipts.reduce((sum, r) => sum + r.xp, 0);
  return { xp, level: 1 + Math.floor(xp / 100), nextLevel: xp % 100, skills: Object.fromEntries(QUEST_SKILLS.map(s => [s.id, receipts.filter(r => r.skill === s.id).reduce((sum, r) => sum + r.xp, 0)])) };
}
