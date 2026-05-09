import React from 'react';
import { NEON, C, alpha } from './game/palette.js';
import { hexPath, hexToPx } from './game/hex.js';
import {
  Mono, Title, Pill, NButton, NeonBar,
} from './game/theme.jsx';
import { SKILL_DEFS } from './game/data.js';
import { CityMap } from './game/map.jsx';
import {
  QuestBoard, GuildRoster, ActivityFeed, VitalsBar,
} from './game/panels.jsx';
import {
  ObjectivesPanel, AlertsPanel,
  WorkerAgentsRow, SelectedUnitCard,
  ActionBar, Minimap, CodebaseOverview,
  LivePulse, Transport,
} from './game/command.jsx';
import {
  QuestDetailModal, PostQuestModal, LootToast, ApprovalModal,
} from './game/modals.jsx';
import { KanbanView } from './game/kanban.jsx';
import { AdventurerAnalysis } from './game/analysis.jsx';
import { useTweaks } from './game/useTweaks.js';
import {
  TweaksPanel, TweakSection, TweakToggle, TweakRadio, TweakStatus,
} from './game/tweaks.jsx';
import { BranchSelector } from './game/branchSelector.jsx';
import { useWorkspace } from './app/useWorkspace.js';
import { isDesktop } from './app/citybaseApi.js';
import { projectRepoTreeToCityModel } from './app/cityModel.js';
import { projectSnapshotToActivity } from './app/activity.js';
import { useAgentDetect } from './app/useAgentDetect.js';
import { useApprovalRequests } from './app/useApprovalRequests.js';
import { citybaseApi } from './app/citybaseApi.js';

const TWEAK_DEFAULTS = {
  role: 'admin', connected: false, agentProvider: 'auto', selectedBranch: null,
};

// Phase 0: no provider yet — every projection of the world starts empty.
// Phase 1+ replaces these with provider-fed values (RepoProvider, GuildProvider, etc).
const EMPTY_GUILDS = Object.freeze([]);
const EMPTY_DISTRICTS = Object.freeze([]);
const EMPTY_BUILDINGS = Object.freeze([]);
const EMPTY_SAGAS = Object.freeze([]);
const EMPTY_ADV_REPORTS = Object.freeze({});

class ErrBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err: err.message || String(err) };
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 20, color: '#ff6b8a', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          RUNTIME ERROR{'\n'}{this.state.err}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrBoundary>
      <CodebaseCity />
    </ErrBoundary>
  );
}

function CodebaseCity() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const role = tweaks.role || 'admin';
  const connected = tweaks.connected === true;
  const agentProvider = tweaks.agentProvider || 'auto';
  const agentDetect = useAgentDetect();
  const approval = useApprovalRequests();
  const dispatchCounterRef = React.useRef(0);

  const workspace = useWorkspace();
  const liveBranch = workspace.snapshot?.branch || null;
  const liveDirty = !!workspace.snapshot?.isDirty;
  const branchLabel = liveBranch || '—';
  const wsLinked = isDesktop ? !!workspace.workspace : connected;
  const cityConnected = isDesktop ? wsLinked : connected;
  const wsLinkedLabel = isDesktop
    ? (workspace.workspace ? `WORKSPACE · ${workspace.workspace.name}` : 'NO WORKSPACE · open one')
    : (connected ? 'LOCAL GIT + AGENT · linked' : 'unlinked');

  const [view, setView] = React.useState('city');
  const [analysisAdv, setAnalysisAdv] = React.useState(null);
  const [kanbanGroup, setKanbanGroup] = React.useState('saga');
  const [questFilter, setQuestFilter] = React.useState('open');
  const [selectedQuest, setSelectedQuest] = React.useState(null);
  const [showPost, setShowPost] = React.useState(false);
  const [focusedDistrict, setFocusedDistrict] = React.useState(null);
  const [expandedGuilds, setExpandedGuilds] = React.useState(new Set());
  const [selectedAdv, setSelectedAdv] = React.useState(null);
  const [quests, setQuests] = React.useState([]);
  const [activity, setActivity] = React.useState([]);
  const [toasts, setToasts] = React.useState([]);
  const [tick, setTick] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(1);
  const [actionTab, setActionTab] = React.useState('actions');

  const guilds = EMPTY_GUILDS;
  const sagas = EMPTY_SAGAS;
  const advReports = EMPTY_ADV_REPORTS;
  const repo = null;

  // Project the workspace's real Git tree into the city's district + building
  // shape. Idle (no workspace) keeps the empty defaults so map.jsx still falls
  // back to the 'NO WORKSPACE LINK' overlay path. Keyed on the snapshot
  // reference because snapshots are produced atomically by useWorkspace —
  // deriving repoTree / dirtyPaths inside avoids a fresh `[]` on each render.
  const snapshot = workspace.snapshot;
  const cityModel = React.useMemo(() => {
    const repoTree = snapshot?.repoTree;
    if (!repoTree || repoTree.length === 0) {
      return { districts: EMPTY_DISTRICTS, buildings: EMPTY_BUILDINGS };
    }
    const dirtyPaths = snapshot?.files?.map(f => f.path) ?? [];
    return projectRepoTreeToCityModel(repoTree, dirtyPaths);
  }, [snapshot]);
  const districts = cityModel.districts;
  const buildings = cityModel.buildings;

  // Activity feed lit by the same snapshot — working-tree changes first,
  // then commit history newest-first. Idle (no snapshot) leaves activity
  // empty so the panel renders blank.
  const liveActivity = React.useMemo(() => projectSnapshotToActivity(snapshot), [snapshot]);

  // Per-path dirty lookup so map.jsx can stamp staged/unstaged glyphs on
  // each affected building. Map<path, { staged, unstaged }>.
  const dirtyByPath = React.useMemo(() => {
    const m = new Map();
    for (const f of snapshot?.files || []) {
      if (!f || typeof f.path !== 'string') continue;
      m.set(f.path, {
        staged: !!f.staged,
        unstaged: f.unstaged !== false,
      });
    }
    return m;
  }, [snapshot]);
  const vitalsRepo = repo ?? (isDesktop && workspace.workspace ? {
    name: workspace.workspace.name,
    remote: workspace.workspace.rootPath,
    branch: liveBranch || '—',
    commit: workspace.snapshot?.recentCommits?.[0]?.hash || '—',
  } : null);
  const currentGuild = guilds[0] ?? null;

  const hasActiveQuests = quests.some(q => q.status === 'active');
  React.useEffect(() => {
    if (!hasActiveQuests) return undefined;
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, [hasActiveQuests]);

  const pawns = React.useMemo(() => {
    return quests.filter(q => q.status === 'active').map(q => {
      const guild = guilds.find(g => g.id === q.guild);
      const adv = guild?.adventurers.find(a => a.id === q.adventurer);
      const fromD = districts.find(d => d.id === 'core');
      const toD = districts.find(d => d.id === q.target);
      if (!fromD || !toD || !adv) return null;
      const from = hexToPx(fromD.q, fromD.r);
      const to = hexToPx(toD.q, toD.r);
      const phase = ((tick * 0.012 + q.progress * 2) % 2);
      const progress = phase < 1 ? phase : 1;
      return { from, to, progress, color: guild.color, label: adv.name.replace('-', '') };
    }).filter(Boolean);
  }, [quests, tick, guilds, districts]);

  const toggleGuild = (id) => {
    setExpandedGuilds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const dispatchAgent = async () => {
    const adv = selectedAdv?.adv;
    if (!cityConnected || !workspace.workspace) {
      pushToast({ text: 'Open a workspace first', color: 'amber', icon: '⚠' });
      return;
    }
    if (!adv) {
      pushToast({ text: 'Pick an adventurer first', color: 'amber', icon: '⚠' });
      return;
    }
    const dispatchId = ++dispatchCounterRef.current;
    try {
      const run = await citybaseApi.agents.startRun({
        provider: agentProvider,
        questId: `dispatch-${dispatchId}`,
        adventurerId: adv.id,
        skill: 'refactor',
        repoUrl: workspace.workspace.rootPath,
        branch: workspace.snapshot?.branch || 'main',
        promptContext: 'investigate the workspace and propose a small refactor',
      });
      pushToast({ text: `Run dispatched · ${run.runId.slice(0, 8)}`, color: 'green', icon: '★' });
    } catch (err) {
      pushToast({ text: err?.message || 'dispatch failed', color: 'red', icon: '✕' });
    }
  };

  const checkoutBranch = async (branchName) => {
    if (!workspace.workspace) {
      pushToast({ text: 'Open a workspace first', color: 'amber', icon: '⚠' });
      return;
    }
    if (!branchName) return;
    try {
      const result = await citybaseApi.git.checkout(workspace.workspace.id, branchName);
      if (!result?.ok) {
        const msg = result?.error?.message || 'checkout failed';
        pushToast({ text: msg, color: 'red', icon: '✕' });
        return;
      }
      setTweak('selectedBranch', null);
      pushToast({ text: `Checked out ${branchName}`, color: 'green', icon: '✓' });
      await workspace.refresh();
    } catch (err) {
      pushToast({ text: err?.message || 'checkout failed', color: 'red', icon: '✕' });
    }
  };

  const commitWorkspace = async (message) => {
    if (!workspace.workspace) {
      pushToast({ text: 'Open a workspace first', color: 'amber', icon: '⚠' });
      return { ok: false };
    }
    const trimmed = (message || '').trim();
    if (!trimmed) {
      pushToast({ text: 'Commit message required', color: 'amber', icon: '⚠' });
      return { ok: false };
    }
    try {
      const result = await citybaseApi.git.commit(workspace.workspace.id, {
        message: trimmed,
        addAll: true,
      });
      if (!result?.ok) {
        const msg = result?.error?.message || 'commit failed';
        pushToast({ text: msg, color: 'red', icon: '✕' });
        return { ok: false };
      }
      const short = result.commitHash ? result.commitHash.slice(0, 8) : '(no hash)';
      pushToast({ text: `Commit landed · ${short}`, color: 'green', icon: '✓' });
      await workspace.refresh();
      return result;
    } catch (err) {
      pushToast({ text: err?.message || 'commit failed', color: 'red', icon: '✕' });
      return { ok: false };
    }
  };

  const runChecks = async () => {
    if (!cityConnected || !workspace.workspace) {
      pushToast({ text: 'Open a workspace first', color: 'amber', icon: '⚠' });
      return;
    }
    pushToast({ text: 'Running checks…', color: 'cyan', icon: '⚯' });
    try {
      const results = await citybaseApi.checks.run(workspace.workspace.id);
      if (!Array.isArray(results) || results.length === 0) {
        pushToast({ text: 'No checks declared in package.json', color: 'amber', icon: '⚯' });
        return;
      }
      const summary = results.map((r) => {
        const short = r.name.split(' · ')[0];
        return `${short} ${r.state}`;
      }).join(' · ');
      const anyFail = results.some((r) => r.state === 'fail');
      pushToast({
        text: `Checks: ${summary}`,
        color: anyFail ? 'red' : 'green',
        icon: anyFail ? '✕' : '✓',
      });
    } catch (err) {
      pushToast({ text: err?.message || 'checks failed', color: 'red', icon: '✕' });
    }
  };

  const pushToast = (t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, ...t }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 2400);
  };

  const acceptQuest = (quest, advId) => {
    if (!currentGuild) return;
    setQuests(prev => prev.map(q => q.id === quest.id ? {
      ...q, status: 'active', lane: 'in-progress',
      adventurer: advId, guild: currentGuild.id,
      progress: 0.05, eta: '08:00',
    } : q));
    setActivity(prev => [{ t: '24:18', kind: 'quest', text: `${quest.id} accepted by ${advId}` }, ...prev]);
    pushToast({ text: `Quest accepted · ${quest.id}`, color: 'cyan', icon: '⚔' });
    setSelectedQuest(null);
    setQuestFilter('active');
  };

  const submitNewQuest = (form) => {
    const id = (form.source === 'agent' ? 'RUN-' : 'TASK-') + (220 + quests.length);
    setQuests(prev => [{ ...form, id, status: 'open', lane: 'todo', posted: 'Victor Ivanov' }, ...prev]);
    setActivity(prev => [{ t: '24:18', kind: 'quest', text: `${id} posted by Victor Ivanov` }, ...prev]);
    pushToast({ text: `Quest posted · ${id}`, color: 'amber', icon: '✚' });
    setShowPost(false);
  };

  const stats = quests.length > 0
    ? [
        { label: 'OPEN QUESTS', value: String(quests.filter(q => q.status === 'open').length), color: 'amber' },
        { label: 'ACTIVE',      value: String(quests.filter(q => q.status === 'active').length), color: 'green' },
      ]
    : [];

  return (
    <div style={{ minHeight: '100vh', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', maxWidth: 1700, margin: '0 auto' }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', border: `1px solid ${NEON.line}`, borderRadius: 4, background: NEON.bg1 }}>
          <svg width="20" height="20" viewBox="-15 -15 30 30">
            <path d={hexPath(0, 0, 12)} fill="none" stroke={NEON.cyan} strokeWidth="1.5" />
            <path d={hexPath(0, 0, 7)} fill={NEON.cyan} opacity="0.6" />
          </svg>
          <Title size={14} weight={700} style={{ letterSpacing: 1 }}>CODEBASE COMMAND</Title>
          <Mono size={9} color="ink3">v0.2 · MVP</Mono>
          {cityConnected && <LivePulse />}
        </div>

        <Pill color={wsLinked ? 'green' : 'red'}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: wsLinked ? NEON.green : NEON.red, boxShadow: `0 0 4px ${wsLinked ? NEON.green : NEON.red}` }} />
          {wsLinkedLabel}
        </Pill>

        {isDesktop && (
          <NButton
            accent={workspace.workspace ? 'cyan' : 'amber'}
            ghost={!!workspace.workspace}
            onClick={workspace.workspace ? workspace.refresh : workspace.pick}
          >
            {workspace.workspace ? '↻ REFRESH' : '＋ OPEN WORKSPACE'}
          </NButton>
        )}

        <Pill color={role === 'admin' ? 'amber' : role === 'member' ? 'cyan' : 'ink3'}>
          ROLE · {role}
        </Pill>

        <div style={{ display: 'flex', gap: 4, marginLeft: 8, padding: 3, background: NEON.bg0, border: `1px solid ${NEON.line}`, borderRadius: 4 }}>
          {[
            { v: 'city',     label: '◇ CITY',     color: 'cyan' },
            { v: 'kanban',   label: '▤ KANBAN',   color: 'magenta' },
            { v: 'analysis', label: '◉ ANALYSIS', color: 'amber' },
          ].map(t => {
            const sel = view === t.v;
            const a = C(t.color);
            return (
              <button
                key={t.v}
                onClick={() => setView(t.v)}
                style={{
                  fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                  padding: '5px 10px',
                  background: sel ? alpha(a, 0.18) : 'transparent',
                  border: `1px solid ${sel ? alpha(a, 0.7) : 'transparent'}`,
                  color: sel ? a : NEON.ink3,
                  cursor: 'pointer', borderRadius: 2,
                  boxShadow: sel ? `0 0 8px ${alpha(a, 0.4)}` : 'none',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <BranchSelector
            workspaceId={workspace.workspace?.id || null}
            currentBranch={branchLabel}
            dirty={liveDirty}
            fileCount={workspace.snapshot?.files?.length || 0}
            selectedBranch={tweaks.selectedBranch}
            onSelect={(name) => setTweak('selectedBranch', name)}
            onCheckout={checkoutBranch}
            api={citybaseApi}
          />
          <Transport
            playing={playing}
            onToggle={() => setPlaying(p => !p)}
            speed={speed}
            onSpeed={(s) => setSpeed(s === speed ? 1 : s)}
          />
          <NButton accent="ink3" ghost>⚙</NButton>
        </div>
      </div>

      {/* VITALS */}
      <VitalsBar stats={stats} repo={vitalsRepo} connected={cityConnected} />

      {/* === KANBAN VIEW === */}
      {view === 'kanban' && (
        <KanbanView
          quests={quests}
          guilds={guilds}
          sagas={sagas}
          onCardClick={setSelectedQuest}
          onOpenAnalysis={(advId) => { setAnalysisAdv(advId); setView('analysis'); }}
          groupBy={kanbanGroup}
          onGroupChange={setKanbanGroup}
        />
      )}

      {/* === ANALYSIS VIEW === */}
      {view === 'analysis' && (
        <AdventurerAnalysis
          advId={analysisAdv}
          guilds={guilds}
          advReports={advReports}
          districts={districts}
          onPickAdv={setAnalysisAdv}
          workspaceDirty={workspace.snapshot?.files?.length || 0}
          onCommit={commitWorkspace}
        />
      )}

      {/* === CITY VIEW === */}
      {view === 'city' && (
        <React.Fragment>
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 280px', gap: 12, alignItems: 'stretch' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ObjectivesPanel items={[]} />
              <AlertsPanel items={[]} />
              <div style={{ flex: 1, minHeight: 200 }}>
                <QuestBoard
                  quests={quests}
                  onSelect={setSelectedQuest}
                  role={role}
                  onPostQuest={() => setShowPost(true)}
                  filter={questFilter}
                  onFilterChange={setQuestFilter}
                />
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <CityMap
                districts={districts}
                buildings={buildings}
                dirtyByPath={dirtyByPath}
                focusedDistrictId={focusedDistrict}
                onSelectDistrict={(d) => setFocusedDistrict(d.id === focusedDistrict ? null : d.id)}
                pawns={cityConnected ? pawns : []}
                connected={cityConnected}
              />
              {focusedDistrict && (() => {
                const d = districts.find(x => x.id === focusedDistrict);
                if (!d) return null;
                const dQuests = quests.filter(q => q.target === d.id);
                return (
                  <div style={{
                    position: 'absolute', top: 12, left: 12, width: 240,
                    background: alpha(NEON.bg1, 0.95),
                    border: `1px solid ${alpha(C(d.color), 0.6)}`,
                    padding: 10, boxShadow: `0 0 30px ${alpha(C(d.color), 0.3)}`,
                  }}>
                    <Mono size={8} color="ink3">DISTRICT</Mono>
                    <Title size={14} color={d.color} weight={700}>{d.label}</Title>
                    <Mono size={9} color="ink3">{d.name} · {d.files} files</Mono>
                    <div style={{ marginTop: 8 }}>
                      <NeonBar label="HEALTH" value={d.health} color={d.color} sub={`${d.health}%`} />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Mono size={8} color="ink3" style={{ letterSpacing: 1 }}>QUESTS · {dQuests.length}</Mono>
                      {dQuests.slice(0, 3).map(q => (
                        <div key={q.id} style={{ marginTop: 4, fontSize: 9, color: NEON.ink2, fontFamily: 'JetBrains Mono' }}>
                          <span style={{ color: C(SKILL_DEFS[q.skill].color) }}>{SKILL_DEFS[q.skill].icon}</span> {q.id} · {q.title.slice(0, 28)}…
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cityConnected && repo && <CodebaseOverview />}
              <ActivityFeed items={liveActivity.length > 0 ? liveActivity : activity.slice(0, 6)} />
            </div>
          </div>

          {/* COMMAND ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 320px 440px', gap: 12, alignItems: 'stretch' }}>
            <Minimap
              districts={districts}
              focusedId={focusedDistrict}
              onSelect={(d) => setFocusedDistrict(d.id === focusedDistrict ? null : d.id)}
              pawnCount={pawns?.length || 0}
            />
            <WorkerAgentsRow
              guilds={guilds}
              selectedAdvId={selectedAdv?.adv?.id}
              onSelect={(adv, guild) => setSelectedAdv({ adv, guild })}
            />
            <SelectedUnitCard
              adv={selectedAdv?.adv}
              guild={selectedAdv?.guild}
              currentTask={quests.find(q => q.adventurer === selectedAdv?.adv?.id && q.status === 'active')}
            />
            <ActionBar
              tab={actionTab}
              onTabChange={setActionTab}
              onFire={(act) => {
                if (act.id === 'dispatch-agent') { dispatchAgent(); return; }
                if (act.id === 'run-checks') { runChecks(); return; }
                pushToast({ text: `${act.label} dispatched`, color: act.color, icon: act.icon });
              }}
            />
          </div>

          {/* GUILD ROSTER */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <GuildRoster
              guilds={guilds}
              expandedGuilds={expandedGuilds}
              onToggleGuild={toggleGuild}
              selectedAdv={selectedAdv?.adv}
              onSelectAdv={(adv, guild) => setSelectedAdv({ adv, guild })}
            />
          </div>
        </React.Fragment>
      )}

      {/* MODALS */}
      {selectedQuest && (
        <QuestDetailModal
          quest={selectedQuest}
          onClose={() => setSelectedQuest(null)}
          onAccept={acceptQuest}
          currentGuild={currentGuild}
        />
      )}
      {showPost && role === 'admin' && (
        <PostQuestModal
          onClose={() => setShowPost(false)}
          onSubmit={submitNewQuest}
        />
      )}
      <LootToast toasts={toasts} />
      <ApprovalModal
        pending={approval.pending}
        onApprove={() => approval.pending && approval.approve(approval.pending.runId)}
        onReject={() => approval.pending && approval.reject(approval.pending.runId)}
      />

      {/* TWEAKS */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Connection">
          <TweakToggle
            label="Local Git + agent linked"
            value={connected}
            onChange={(v) => setTweak('connected', v)}
          />
        </TweakSection>
        <TweakSection title="Role">
          <TweakRadio
            label="Permission"
            value={role}
            onChange={(v) => setTweak('role', v)}
            options={[
              { value: 'admin',  label: 'Admin' },
              { value: 'member', label: 'Member' },
              { value: 'viewer', label: 'Viewer' },
            ]}
          />
        </TweakSection>
        <TweakSection title="Agents">
          <TweakStatus
            label="codex"
            state={
              agentDetect.status === 'pending' ? 'pending'
                : agentDetect.result.codex.found ? 'ok'
                : 'bad'
            }
            meta={
              agentDetect.status === 'pending' ? 'detecting…'
                : agentDetect.result.codex.found ? agentDetect.result.codex.path
                : 'not installed'
            }
          />
          <TweakStatus
            label="claude"
            state={
              agentDetect.status === 'pending' ? 'pending'
                : agentDetect.result.claude.found ? 'ok'
                : 'bad'
            }
            meta={
              agentDetect.status === 'pending' ? 'detecting…'
                : agentDetect.result.claude.found ? agentDetect.result.claude.path
                : 'not installed'
            }
          />
          <TweakRadio
            label="Provider"
            value={agentProvider}
            onChange={(v) => setTweak('agentProvider', v)}
            options={[
              { value: 'auto',   label: 'Auto' },
              { value: 'codex',  label: 'Codex' },
              { value: 'claude', label: 'Claude' },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}
