import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { citybaseApi } from './app/citybaseApi.js';
import { useWorkspace } from './app/useWorkspace.js';
import { useAgentDetect } from './app/useAgentDetect.js';
import { useApprovalRequests } from './app/useApprovalRequests.js';
import { useRunHistory } from './app/useRunHistory.js';
import { useRunEvents } from './app/useRunEvents.js';
import { runPhase, touchedPathsFromEvents, toRepoRelative } from './app/runCity.js';
import { ApprovalModal } from './game/modals.jsx';
import { createWorldModel, repositoryPaths } from './city/worldModel.js';
import { WorldCanvas } from './city/WorldCanvas.jsx';
import { Icon } from './city/Icon.jsx';
import { AgentPortrait } from './city/AgentPortrait.jsx';
import { ADVENTURERS, agentProgress, claimReward, loadGuild, rewardFor } from './city/guildProgress.js';
import './city/model-shop.css';
import { Atlas } from './city/Atlas.jsx';
import { FileInspector } from './city/FileInspector.jsx';
import { QuestPanel } from './city/QuestPanel.jsx';

class ErrBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    return this.state.error ? <div className="app-error"><h1>The city needs a moment.</h1><p>{this.state.error.message}</p><button className="primary-button" onClick={() => location.reload()}>Return to the city</button></div> : this.props.children;
  }
}
function Brand() { return <div className="brand"><img className="brand-icon" src="./icon.svg" alt=""/><span>citybase<span className="brand-period">.</span></span></div>; }
function AppShell() {
  const workspace = useWorkspace();
  const detect = useAgentDetect();
  const approval = useApprovalRequests();
  const runs = useRunHistory();
  return <div className="citybase-app">
    {workspace.workspace ? <RepositoryWorld key={workspace.workspace.id} workspace={workspace} detect={detect} runs={runs}/> : <>
      <header className="world-header"><Brand/><span className="header-note">A SMALL WORLD OF POSSIBILITIES</span><span className="local-badge"><i/>LOCAL FIRST</span></header>
      <main className="welcome"><div className="welcome-orbit"><div className="welcome-island"><i/><i/><i/><i/><i/><span>c.</span></div></div><div className="welcome-copy"><span className="eyebrow">YOUR NEXT ADVENTURE STARTS HERE</span><h1>Welcome to<br/>the <em>model shop.</em></h1><p>Put a repository on the workbench.<br/>Walk the model with Pip. Pick your crew.<br/>Then make something on your real computer.</p><button className="primary-button" onClick={workspace.pick} disabled={workspace.status === 'loading'}><Icon name="folder"/>{workspace.status === 'loading' ? 'Opening the gates…' : 'Open your first city'}<Icon name="arrow"/></button><span className="welcome-hint">CHOOSE A LOCAL GIT REPOSITORY</span>{workspace.error && <p role="alert" className="error">{workspace.error.message}</p>}</div><span className="welcome-bottom">A place for the joy of making things.</span></main>
    </>}
    <ApprovalModal pending={approval.pending} onApprove={() => approval.pending && approval.approve(approval.pending.runId)} onReject={() => approval.pending && approval.reject(approval.pending.runId)}/>
  </div>;
}
function loadDiscoveries(id) { try { const saved = JSON.parse(localStorage.getItem(`citybase:discoveries:${id}`) || '[]'); return Array.isArray(saved) ? saved.filter(x => typeof x === 'string') : []; } catch { return []; } }
function RepositoryWorld({ workspace: state, detect, runs: allRuns }) {
  const workspace = state.workspace;
  const snapshot = state.snapshot;
  const sceneRef = useRef(null);
  // Status refreshes must never rebuild the city or reset its camera.
  const pathsKey = JSON.stringify(repositoryPaths(snapshot));
  const paths = useMemo(() => JSON.parse(pathsKey), [pathsKey]);
  const model = useMemo(() => createWorldModel(paths), [paths]);
  const [selected, setSelected] = useState(null);
  const [progress, setProgress] = useState(() => loadGuild(workspace.id));
  const [tutorial, setTutorial] = useState(() => { try { return JSON.parse(localStorage.getItem(`citybase:tutorial:${workspace.id}`) || '{}'); } catch { return {}; } });
  const [chosenAgentId, setChosenAgentId] = useState('juniper');
  const [assigning, setAssigning] = useState(false);
  const [questSkill, setQuestSkill] = useState('survey');
  useEffect(() => { try { localStorage.setItem(`citybase:guild:${workspace.id}`, JSON.stringify(progress)); } catch { /* optional persistence */ } }, [workspace.id, progress]);
  useEffect(() => { try { localStorage.setItem(`citybase:tutorial:${workspace.id}`, JSON.stringify(tutorial)); } catch { /* optional persistence */ } }, [workspace.id, tutorial]);
  const [panel, setPanel] = useState(null);
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState(null);
  const [time, setTime] = useState('night');
  const [orbit, setOrbit] = useState(false);
  const [scout, setScout] = useState(false);
  const [sound, setSound] = useState(false);
  const [visited, setVisited] = useState(() => loadDiscoveries(workspace.id));
  const [notice, setNotice] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [questPrompt, setQuestPrompt] = useState('');
  const [questKey, setQuestKey] = useState(0);
  const [ready, setReady] = useState(false);
  const soundContext = useRef(null);
  const noticeTimer = useRef(null);
  const visitedRef = useRef(new Set(visited));
  const runs = useMemo(() => allRuns.filter(r => r.workspaceId === workspace.id || r.rootPath === workspace.rootPath), [allRuns, workspace.id, workspace.rootPath]);
  const activeRun = runs.find(r => r.status === 'running' || r.status === 'awaiting-approval') || null;
  const selectedRun = runs.find(r => r.runId === selectedRunId) || (selectedRunId ? null : undefined);
  const events = useRunEvents(activeRun?.runId);
  const phase = runPhase(activeRun, events);
  const activePaths = useMemo(() => touchedPathsFromEvents(events).map(p => toRepoRelative(p, workspace.rootPath)).filter(Boolean), [events, workspace.rootPath]);
  const change = snapshot?.files?.find(f => f.path === selected);
  const changes = snapshot?.files || [];
  const found = visited.filter(id => model.districts.some(d => d.id === id));
  const lessons = [found.length > 0, !!tutorial.openedBuilding, !!tutorial.choseCrew, progress.receipts.length > 0];
  const step = lessons.findIndex(done => !done);
  const complete = step === -1;
  const lessonTitles = ['Put your feet on the map.', 'Knock on a door.', 'Find a pair of hands.', 'Bring back a field report.'];
  const lessonCopy = ['Meet Pip, your painted scout. Walk into a neighborhood with WASD, or pick a tag on the model.', 'Every building is a real file on this computer. Click one and take a look inside.', 'Choose Juniper or Mica from the crew tray. They use your installed local coding agents.', 'Send your crew on a Survey job. When they return, stamp the work order to earn their first skill points.'];
  const error = state.error || snapshot?.error;
  const notify = useCallback((title, text) => {
    clearTimeout(noticeTimer.current); setNotice({ title, text });
    noticeTimer.current = setTimeout(() => setNotice(null), 4400);
  }, []);
  useEffect(() => () => { clearTimeout(noticeTimer.current); soundContext.current?.close(); }, []);
  const chime = useCallback(() => {
    if (!sound) return;
    try {
      const ctx = soundContext.current || new AudioContext(); soundContext.current = ctx; ctx.resume();
      [523.25, 659.25, 783.99].forEach((note, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = note; osc.connect(gain); gain.connect(ctx.destination);
        const t = ctx.currentTime + i * .07; gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.055, t + .012); gain.gain.exponentialRampToValueAtTime(.001, t + .4); osc.start(t); osc.stop(t + .42);
      });
    } catch { /* The world remains playable without audio. */ }
  }, [sound]);
  const visit = useCallback(id => {
    if (visitedRef.current.has(id)) return;
    const d = model.districts.find(d => d.id === id); if (!d) return;
    visitedRef.current.add(id); const next = [...visitedRef.current]; setVisited(next);
    try { localStorage.setItem(`citybase:discoveries:${workspace.id}`, JSON.stringify(next)); } catch { /* storage is optional */ }
    chime(); notify('New neighborhood discovered', d.label);
  }, [model, workspace.id, chime, notify]);
  const select = useCallback(path => {
    if (!path) return;
    setSelected(path); setOrbit(false);
    if (assigning) {
      setQuestPrompt(`Explore ${path} and explain its role in this project. Write a short field report. Do not edit files.`);
      setSelectedRunId(null); setQuestSkill('survey'); setQuestKey(k => k + 1); setPanel('quests'); setAssigning(false);
    } else { setPanel('building'); setTutorial(t => ({ ...t, openedBuilding: true })); }
    sceneRef.current?.focus(path); sceneRef.current?.travelTo?.(path); chime();
  }, [chime, assigning]);
  const navigate = id => {
    setSelected(null); setDistrict(id); setOrbit(false);
    if (id) { sceneRef.current?.focus(id); sceneRef.current?.travelTo?.(id); }
    else sceneRef.current?.fit();
  };
  const openQuest = (prompt = '', skill = 'survey') => { setQuestPrompt(prompt); setQuestSkill(skill); setSelectedRunId(null); setQuestKey(k => k + 1); setPanel('quests'); setAssigning(false); };
  const chooseAgent = id => { setChosenAgentId(id); setTutorial(t => ({ ...t, choseCrew: true })); };
  const claim = run => {
    const reward = rewardFor(run); if (!reward || progress.receipts.some(r => r.runId === run.runId)) return;
    const next = claimReward(progress, run); setProgress(next); chime();
    const agent = ADVENTURERS.find(a => a.id === reward.agent); const before = agentProgress(progress, agent.id); const after = agentProgress(next, agent.id);
    notify(after.level > before.level ? `${agent.name} reached level ${after.level}` : 'Work order stamped', `+${reward.xp} ${reward.skill} XP · ${agent.name}`);
  };
  const startLesson = () => {
    if (step === 0) { setScout(true); setPanel(null); }
    else if (step === 1) { setPanel('atlas'); setQuery(''); }
    else if (step === 2) openQuest();
    else if (step === 3) openQuest('Explore this repository and write a short field report. Explain what it does and name the three most important files. Do not edit any files.');
    else openQuest('Create one standalone file named citybase-campfire.html in this repository: an interactive campfire scene with a day/night toggle. Use embedded CSS and JavaScript, no dependencies. Do not modify any other files. Summarize the new file.', 'craft');
  };
  useEffect(() => {
    const onKey = e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPanel('atlas'); setQuery(''); requestAnimationFrame(() => document.querySelector('.atlas-search input')?.focus()); }
      if (e.key === 'Escape') { setPanel(null); setSelected(null); setScout(false); setAssigning(false); }
      if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'h') { sceneRef.current?.fit(); setSelected(null); setDistrict(null); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const refresh = useRef(state.refresh);
  useEffect(() => { refresh.current = state.refresh; }, [state.refresh]);
  useEffect(() => {
    if (!activeRun?.runId) return undefined;
    const interval = setInterval(() => refresh.current(), 2500);
    return () => { clearInterval(interval); refresh.current(); };
  }, [activeRun?.runId]);
  const dispatch = async ({ provider, promptContext, readOnly = true, adventurerId, questSkill }) => {
    const run = await citybaseApi.agents.startRun({ workspaceId: workspace.id, provider, questId: `quest-${Date.now()}`, adventurerId, questSkill, skill: readOnly ? 'review' : 'refactor', branch: snapshot?.branch || 'main', promptContext, readOnly, approvalMode: 'ask' });
    if (run?.runId) { setSelectedRunId(run.runId); notify('The job is on the board', 'Your crew’s notes will arrive from the real local agent.'); }
    return run;
  };
  const cancel = async runId => { try { await citybaseApi.agents.cancel(runId); notify('Adventurer recalled', 'The local agent has been asked to stop.'); } catch (e) { notify('Recall failed', e.message); } };
  const handleReady = useCallback(() => setReady(true), []);
  return <>
    <header className="world-header"><Brand/><div className="header-divider"/><button className="workspace-switch" aria-label={`Open another repository. Current city: ${workspace.name}`} onClick={state.pick} title={workspace.rootPath}><span className="workspace-label">YOUR WORLD</span><span>{workspace.name}<span className="switch-chevron">⌄</span></span></button><span className="branch-badge" title={snapshot?.branch}><Icon name="branch" size={13}/>{snapshot?.branch || '…'}</span><div className="header-spacer"/><span className="local-badge" title={workspace.rootPath}><i/>LIVE REPOSITORY</span><button className={`header-action ${panel === 'quests' ? 'active' : ''}`} aria-label="Quest log" onClick={() => setPanel(panel === 'quests' ? null : 'quests')}><Icon name="quest"/>Job ledger{runs.length > 0 && <span className="count-badge">{runs.length}</span>}</button><button className="icon-button" onClick={state.refresh} aria-label="Refresh city" title="Refresh repository"><Icon name="refresh" size={17} className={state.status === 'loading' ? 'spin' : ''}/></button></header>
    <main className={`world ${panel ? 'has-drawer' : ''}`}>
      {model.buildings.length > 0 && <WorldCanvas model={model} sceneRef={sceneRef} selected={selected} changes={changes} activePaths={activePaths} activeRun={activeRun} district={district} time={time} orbit={orbit} scout={scout} visited={found} onSelect={select} onVisit={visit} onReady={handleReady}/>}
      <div className="world-vignette"/>
      <section className="world-title title-block"><span className="eyebrow">CITYBASE / THE MODEL SHOP</span><h1>{district ? model.districts.find(d => d.id === district)?.label : workspace.name}</h1><p>{model.totalFiles} FILES · {model.districts.length} NEIGHBORHOODS</p><span className="title-block-note">A working model of your real project.</span></section>
      {!panel && <section className={`expedition-card work-order ${complete ? 'complete' : ''}`}><div className="order-kicker"><span>WORK ORDER</span><span>001 / FIRST SHIFT</span></div><div className="expedition-heading"><h3>{complete ? 'You’re part of the crew.' : lessonTitles[step]}</h3></div><p>{complete ? 'First shift, complete. Ready to make something? Your next work order builds an actual interactive campfire file.' : lessonCopy[step]}</p><ol className="lesson-checklist">{['Walk Pip', 'Open a real file', 'Choose your crew', 'Stamp a finished job'].map((label, i) => <li key={label} className={lessons[i] ? 'done' : i === step ? 'current' : ''}><span>{lessons[i] ? '✓' : `0${i + 1}`}</span>{label}</li>)}</ol>{complete && <span className="order-stamp">DONE</span>}<button className="text-button" onClick={startLesson}>{complete ? 'Build the campfire' : ['Meet Pip', 'Find a building', 'Meet the crew', 'Start the survey'][step]}<Icon name="arrow" size={16}/></button></section>}
      <section className="crew-tray" aria-label="Crew tray"><span className="eyebrow">{assigning ? 'PLACE ON A BUILDING' : 'YOUR CREW'}</span><div>{ADVENTURERS.map(agent => { const stats = agentProgress(progress, agent.id); const available = !!detect?.result?.[agent.provider]?.found; return <button key={agent.id} className={`crew-token ${chosenAgentId === agent.id ? 'chosen' : ''}`} disabled={!available} aria-label={`Assign ${agent.name}, ${agent.provider}, level ${stats.level}`} title={`${agent.name} / ${agent.provider} / ${available ? 'Click, then choose a building' : 'not installed'}`} onClick={() => { chooseAgent(agent.id); setAssigning(true); setPanel(null); notify(`${agent.name}, ready for work`, 'Click a building to assign a survey.'); }}><AgentPortrait agent={agent} size="small"/><span>{agent.name}</span><b>LV {stats.level}</b></button>; })}</div><small>Pick a token. Then pick a building.</small></section>
      {error && <div className="workspace-error" role="alert"><strong>The city couldn’t read this repository.</strong><p>{error.message}</p><button className="secondary-button" onClick={state.pick}>Choose another folder</button></div>}
      {!error && !model.buildings.length && <div className="workspace-error"><Icon name="home" size={30}/><h2>{state.status === 'loading' ? 'Building your world…' : 'Room for a new beginning.'}</h2><p>{state.status === 'loading' ? 'Reading your local repository.' : 'This repository has no files yet. Add a file, then refresh to see the first building.'}</p><button className="secondary-button" onClick={state.refresh}>Refresh city</button></div>}
      {model.buildings.length > 0 && !ready && <div className="world-loading" role="status">Raising the skyline<span>•••</span></div>}
      {panel === 'atlas' && <Atlas model={model} query={query} onQuery={setQuery} district={district} onDistrict={navigate} selected={selected} onSelect={select} changes={changes} visited={found} onClose={() => setPanel(null)}/>}
      {panel === 'building' && selected && <FileInspector key={selected} path={selected} workspace={workspace} api={citybaseApi} change={change} revision={snapshot} onClose={() => { setPanel(null); setSelected(null); }} onQuest={openQuest}/>}
      {panel === 'quests' && <QuestPanel key={`${questKey}:${selectedRunId || 'new'}`} api={citybaseApi} workspace={workspace} run={selectedRun} runs={runs} detect={detect} initialPrompt={questPrompt} initialSkill={questSkill} chosenAgentId={chosenAgentId} progress={progress} onChooseAgent={chooseAgent} onClaim={claim} onClose={() => setPanel(null)} onRun={dispatch} onCancel={cancel} onSelectRun={setSelectedRunId}/>}
      {activeRun && <button className="live-quest" onClick={() => { setSelectedRunId(activeRun.runId); setPanel('quests'); }}><span className="live-quest-orb"><Icon name="spark"/></span><span><small>CREW ON THE JOB</small><strong>{activeRun.provider} · {activeRun.status === 'awaiting-approval' ? 'Awaiting departure' : phase.label}</strong></span><Icon name="arrow" size={15}/></button>}
      <div className="world-legend"><span><i style={{ background: '#6f8f4c' }}/>Staged</span><span><i style={{ background: '#c8391f' }}/>Changed</span><span><i style={{ background: '#c9b48a' }}/>At peace</span></div>
      <nav className="world-dock" aria-label="World controls"><div className="dock-tools"><button className="dock-button" onClick={() => { sceneRef.current?.fit(); setSelected(null); setDistrict(null); setOrbit(false); }} aria-label="Return to city overview" title="Overview · H"><Icon name="home"/></button><button className={`dock-button ${scout ? 'active' : ''}`} onClick={() => { setScout(!scout); setOrbit(false); }} aria-label="Explore on foot" aria-pressed={scout} title="Guide Pip · WASD to walk, Space to hop"><Icon name="walk"/></button><button className={`dock-button ${panel === 'atlas' ? 'active' : ''}`} onClick={() => setPanel(panel === 'atlas' ? null : 'atlas')} aria-label="Open atlas" title="Atlas · ⌘ K"><Icon name="compass"/></button><span className="dock-separator"/><button className={`dock-button ${orbit ? 'active' : ''}`} onClick={() => { setOrbit(!orbit); setScout(false); }} aria-label="Orbit the city" aria-pressed={orbit} title="Take the scenic route"><Icon name="orbit"/></button><button className="dock-button" onClick={() => setTime(time === 'night' ? 'day' : 'night')} aria-label={time === 'night' ? 'Switch to daylight' : 'Switch to night'} title="Change the time of day"><Icon name={time === 'night' ? 'moon' : 'sun'}/></button><button className={`dock-button sound-toggle ${sound ? 'active' : ''}`} onClick={() => setSound(!sound)} aria-label={sound ? 'Mute discovery sounds' : 'Enable discovery sounds'} title="Discovery sounds"><Icon name={sound ? 'volume' : 'mute'}/></button></div><button className="new-quest-button" aria-label="New quest" onClick={() => openQuest()}><Icon name="plus" size={17}/>New job<Icon name="spark" size={16}/></button></nav>
      <div className="zoom-control"><button aria-label="Zoom in" onClick={() => sceneRef.current?.zoom(1.2)}><Icon name="plus" size={16}/></button><button aria-label="Zoom out" onClick={() => sceneRef.current?.zoom(1 / 1.2)}><Icon name="minus" size={16}/></button></div>
      <div className="world-help">{scout ? <><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk · Space to hop · click ground to move</> : <>Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Click a building to investigate</>}</div>
      {notice && <div className="discovery-notice" role="status"><span><Icon name="spark" size={22}/></span><div><small>{notice.title}</small><strong>{notice.text}</strong></div></div>}
    </main>
    <footer className="world-footer"><span><i/>REAL FILES / LOCAL MACHINE</span><span title={workspace.rootPath} className="footer-path">{workspace.rootPath}</span><span>{changes.length ? `${changes.length} changed files` : 'All quiet in the city'}<span className="footer-star">✦</span></span></footer>
  </>;
}
export default function App() { return <ErrBoundary><AppShell/></ErrBoundary>; }
