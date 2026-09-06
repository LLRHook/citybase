import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';
import { AgentPortrait } from './AgentPortrait.jsx';
import { ADVENTURERS, QUEST_SKILLS, agentProgress, rewardFor } from './guildProgress.js';
import { useRunEvents } from '../app/useRunEvents.js';
export function QuestPanel({ api, workspace, run, runs, detect, initialPrompt, initialSkill = 'survey', chosenAgentId, progress, onChooseAgent, onClaim, onClose, onRun, onCancel, onSelectRun }) {
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [provider, setProvider] = useState(ADVENTURERS.find(a => a.id === chosenAgentId)?.provider || (detect?.result?.claude?.found ? 'claude' : 'codex'));
  const [questSkill, setQuestSkill] = useState(initialSkill);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [historyEvents, setHistoryEvents] = useState([]);
  const live = useRunEvents(run?.runId, { api });
  const runId = run?.runId;
  const runStatus = run?.status;
  const skill = QUEST_SKILLS.find(s => s.id === questSkill);
  const selectedAgent = ADVENTURERS.find(a => a.provider === provider);
  const reward = rewardFor(run);
  const claimed = progress.receipts.some(r => r.runId === runId);
  const runAgent = ADVENTURERS.find(a => a.id === run?.adventurerId) || ADVENTURERS.find(a => a.provider === run?.provider);
  useEffect(() => {
    if (!runId || !api.agents.getEvents) return undefined;
    let alive = true;
    api.agents.getEvents(runId).then(events => { if (alive) setHistoryEvents(Array.isArray(events) ? events : []); }, () => {});
    return () => { alive = false; };
  }, [api, runId, runStatus]);
  const events = live.length > historyEvents.length ? live : historyEvents;
  const submit = async e => {
    e.preventDefault(); if (busy || !prompt.trim()) return;
    setBusy(true); setError(null);
    try { await onRun({ provider, adventurerId: selectedAgent.id, promptContext: prompt.trim(), readOnly: skill.readOnly, questSkill }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <aside className="drawer quest-drawer" aria-label="Quest log">
    <div className="drawer-heading"><span className="eyebrow">CITYBASE MODEL SHOP / WORK ORDERS</span><button className="icon-button" onClick={onClose} aria-label="Close quest log"><Icon name="close"/></button></div>
    {run ? <>
      <div className="order-number">NO. {run.runId.slice(0, 6).toUpperCase()}<span>{run.questSkill || (run.readOnly ? 'survey' : 'craft')}</span></div>
      <div className="order-agent">{runAgent && <AgentPortrait agent={runAgent}/>}<div><h2>{run.status === 'running' ? 'On the job.' : run.status === 'done' ? 'Back at the shop.' : run.status === 'cancelled' ? 'Job called off.' : run.status === 'awaiting-approval' ? 'Ready when you are.' : 'A snag in the plan.'}</h2><p className="muted">{runAgent?.name || run.provider} / {run.provider} / {run.status}</p></div></div>
      {run.prompt && <p className="quest-prompt">{run.prompt}</p>}
      <div className="quest-stream" aria-live="polite">{events.length ? events.map((e, i) => <div key={i} className={`stream-event ${e.kind === 'error' ? 'error' : ''}`}><span>{e.kind}</span><p>{e.text}</p></div>) : <p className="muted">The crew’s notes will arrive here.</p>}</div>
      {['running', 'awaiting-approval'].includes(run.status) && <button className="secondary-button" onClick={() => onCancel(run.runId)}>Recall adventurer</button>}
      {reward && <button className={`primary-button collect-reward ${claimed ? 'claimed' : ''}`} disabled={claimed} onClick={() => onClaim(run)}><Icon name="check"/>{claimed ? 'STAMPED & FILED' : `Stamp complete · +${reward.xp} ${QUEST_SKILLS.find(s => s.id === reward.skill).label} XP`}</button>}
      {run.status === 'done' && !reward && <p className="fine-print">{run.outcome?.reason || 'This run has no verified skill reward. The actual job notes are above.'}</p>}
      <button className="primary-button" onClick={() => onSelectRun(null)}><Icon name="plus"/>Another adventure</button>
      <p className="fine-print">Real CLI notes. Inspect the buildings to see the current files on your computer.</p>
    </> : <>
      <div className="order-number">NEW WORK ORDER<span>LOCAL WORKSHOP</span></div>
      <h2>Good things need<br/>a pair of hands.</h2>
      <p className="muted">Pick your crew. Give them a job.<br/>Watch the model change as they work.</p>
      <div className="crew-roster">{ADVENTURERS.map(agent => {
        const stats = agentProgress(progress, agent.id); const available = !!detect?.result?.[agent.provider]?.found;
        return <button type="button" key={agent.id} aria-label={`Choose ${agent.name}, ${agent.provider} ${available ? 'ready' : 'unavailable'}`} disabled={!available} className={`crew-card ${provider === agent.provider ? 'selected' : ''}`} onClick={() => { setProvider(agent.provider); onChooseAgent(agent.id); }}><AgentPortrait agent={agent}/><span><strong>{agent.name}<b>LV {stats.level}</b></strong><small>{agent.provider} · {available ? 'ready for work' : 'not installed'}</small><span className="crew-skill-tallies">{QUEST_SKILLS.map(s => <i key={s.id} title={`${s.label}: ${stats.skills[s.id]} XP`}><Icon name={s.icon} size={11}/><span>{s.short} {1 + Math.floor(stats.skills[s.id] / 100)}<small>{stats.skills[s.id]} XP</small></span></i>)}</span></span><span className="crew-selected">{provider === agent.provider ? '●' : '○'}</span></button>;
      })}</div>
      <form onSubmit={submit} className="quest-form">
        <div className="quest-mode">{QUEST_SKILLS.map(s => <button type="button" key={s.id} className={questSkill === s.id ? 'active' : ''} onClick={() => setQuestSkill(s.id)}><Icon name={s.icon} size={15}/>{s.short}</button>)}</div><p className="skill-description">{skill.description} <b>{skill.readOnly ? 'READ ONLY' : 'CAN EDIT FILES'}</b></p>
        <label htmlFor="quest-prompt">THE QUEST</label><textarea id="quest-prompt" placeholder="Describe the job for your crew…" value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}/>
        <div className="quest-suggestions"><button type="button" onClick={() => { setQuestSkill('survey'); setPrompt('Explore this repository and write a short field report. Explain what it does and name the three most important files. Do not edit any files.'); }}>Survey the town</button><button type="button" onClick={() => { setQuestSkill('craft'); setPrompt('Create one standalone file named citybase-campfire.html in this repository: a charming interactive campfire scene with a button that toggles day and night. Use embedded CSS and JavaScript, no dependencies. Do not modify any other files. Summarize the new file.'); }}>Build a campfire</button></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="primary-button" disabled={busy || !prompt.trim() || !detect?.result?.[provider]?.found}><Icon name="arrow"/>{busy ? 'Preparing the job…' : 'Dispatch adventurer'}</button>
        <p className="fine-print">{selectedAgent?.name} uses {provider} in {workspace.name}. {skill.readOnly ? 'Survey jobs can read files; they cannot edit.' : 'This job can change real files. You approve access before it starts.'}</p>
      </form>
      <div className="past-quests"><div className="drawer-heading"><span className="eyebrow">THE JOB LEDGER</span><span className="count-badge">{runs.length}</span></div>{runs.length ? runs.map(r => <button key={r.runId} className="history-row" onClick={() => onSelectRun(r.runId)}><span className={`history-icon ${r.status === 'done' ? 'mint' : 'amber'}`}><Icon name={r.status === 'done' ? 'check' : 'quest'}/></span><span><strong>{r.prompt?.slice(0, 58) || `${r.provider} work order`}</strong><small>{r.status} · {new Date(r.startedAt).toLocaleDateString()}</small></span><Icon name="arrow" size={14}/></button>) : <p className="muted">No jobs on the books. Yet.</p>}</div>
      <p className="fine-print ledger-note">Skill levels are your shop’s record of verified jobs. They track your crew’s experience here; the underlying models stay the same.</p>
    </>}
  </aside>;
}
