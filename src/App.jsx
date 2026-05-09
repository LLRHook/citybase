import React from 'react';
import { NEON, C, alpha } from './game/palette.js';
import { hexPath, hexToPx } from './game/hex.js';
import {
  Mono, Title, Pill, NButton, NeonBar,
} from './game/theme.jsx';
import {
  REPO, DISTRICTS, GUILDS, SKILL_DEFS, ACTIVITY,
} from './game/data.js';
import { QUESTS_V2 } from './game/sagas.js';
import { OBJECTIVES, ALERTS } from './data/seed.js';
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
  QuestDetailModal, PostQuestModal, LootToast,
} from './game/modals.jsx';
import { KanbanView } from './game/kanban.jsx';
import { AdventurerAnalysis } from './game/analysis.jsx';
import { useTweaks } from './game/useTweaks.js';
import {
  TweaksPanel, TweakSection, TweakToggle, TweakRadio,
} from './game/tweaks.jsx';

const TWEAK_DEFAULTS = { role: 'admin', connected: true };

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
  const connected = tweaks.connected !== false;

  const [view, setView] = React.useState('city');
  const [analysisAdv, setAnalysisAdv] = React.useState('alpha-7');
  const [kanbanGroup, setKanbanGroup] = React.useState('saga');
  const [questFilter, setQuestFilter] = React.useState('open');
  const [selectedQuest, setSelectedQuest] = React.useState(null);
  const [showPost, setShowPost] = React.useState(false);
  const [focusedDistrict, setFocusedDistrict] = React.useState(null);
  const [expandedGuilds, setExpandedGuilds] = React.useState(new Set(['victor']));
  const [selectedAdv, setSelectedAdv] = React.useState({ adv: GUILDS[0].adventurers[0], guild: GUILDS[0] });
  const [quests, setQuests] = React.useState(QUESTS_V2);
  const [activity, setActivity] = React.useState(ACTIVITY);
  const [toasts, setToasts] = React.useState([]);
  const [tick, setTick] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(1);
  const [actionTab, setActionTab] = React.useState('actions');

  const currentGuild = GUILDS[0];

  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  const pawns = React.useMemo(() => {
    return quests.filter(q => q.status === 'active').map(q => {
      const guild = GUILDS.find(g => g.id === q.guild);
      const adv = guild?.adventurers.find(a => a.id === q.adventurer);
      const fromD = DISTRICTS.find(d => d.id === 'core');
      const toD = DISTRICTS.find(d => d.id === q.target);
      if (!fromD || !toD || !adv) return null;
      const from = hexToPx(fromD.q, fromD.r);
      const to = hexToPx(toD.q, toD.r);
      const phase = ((tick * 0.012 + q.progress * 2) % 2);
      const progress = phase < 1 ? phase : 1;
      return { from, to, progress, color: guild.color, label: adv.name.replace('-', '') };
    }).filter(Boolean);
  }, [quests, tick]);

  const toggleGuild = (id) => {
    setExpandedGuilds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pushToast = (t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, ...t }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 2400);
  };

  const acceptQuest = (quest, advId) => {
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
    const id = (form.source === 'jira' ? 'JIRA-' : 'BB-') + (220 + quests.length);
    setQuests(prev => [{ ...form, id, status: 'open', lane: 'todo', posted: 'Victor Ivanov' }, ...prev]);
    setActivity(prev => [{ t: '24:18', kind: 'quest', text: `${id} posted by Victor Ivanov` }, ...prev]);
    pushToast({ text: `Quest posted · ${id}`, color: 'amber', icon: '✚' });
    setShowPost(false);
  };

  React.useEffect(() => {
    const id = setInterval(() => {
      pushToast({ text: `+240 XP · Alpha-7`, color: 'amber', icon: '★' });
    }, 14000);
    return () => clearInterval(id);
  }, []);

  const stats = [
    { label: 'BUILD HEALTH', value: '92', unit: '%', color: 'green' },
    { label: 'COVERAGE',     value: '81', unit: '%', color: 'cyan' },
    { label: 'CONTEXT',      value: '78', unit: '%', color: 'magenta' },
    { label: 'VELOCITY',     value: '1.42', unit: '/hr', color: 'amber' },
    { label: 'OPEN QUESTS',  value: String(quests.filter(q => q.status === 'open').length), color: 'amber' },
    { label: 'ACTIVE',       value: String(quests.filter(q => q.status === 'active').length), color: 'green' },
  ];

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
          {connected && <LivePulse />}
        </div>

        <Pill color={connected ? 'green' : 'red'}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? NEON.green : NEON.red, boxShadow: `0 0 4px ${connected ? NEON.green : NEON.red}` }} />
          {connected ? 'BITBUCKET + JIRA · linked' : 'unlinked'}
        </Pill>

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
          <Mono size={9} color="ink3">BRANCH</Mono>
          <Mono size={10} color="cyan" weight={700}>{REPO.branch}</Mono>
          <Mono size={9} color="ink3" style={{ marginLeft: 8 }}>TIME</Mono>
          <Mono size={10} color="ink" weight={700}>24:17</Mono>
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
      <VitalsBar stats={stats} repo={REPO} />

      {/* === KANBAN VIEW === */}
      {view === 'kanban' && (
        <KanbanView
          quests={quests}
          onCardClick={setSelectedQuest}
          onOpenAnalysis={(advId) => { setAnalysisAdv(advId); setView('analysis'); }}
          groupBy={kanbanGroup}
          onGroupChange={setKanbanGroup}
        />
      )}

      {/* === ANALYSIS VIEW === */}
      {view === 'analysis' && (
        <AdventurerAnalysis advId={analysisAdv} onPickAdv={setAnalysisAdv} />
      )}

      {/* === CITY VIEW === */}
      {view === 'city' && (
        <React.Fragment>
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 280px', gap: 12, alignItems: 'stretch' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ObjectivesPanel items={OBJECTIVES} />
              <AlertsPanel items={ALERTS} />
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
                focusedDistrictId={focusedDistrict}
                onSelectDistrict={(d) => setFocusedDistrict(d.id === focusedDistrict ? null : d.id)}
                pawns={connected ? pawns : []}
                connected={connected}
              />
              {focusedDistrict && (() => {
                const d = DISTRICTS.find(x => x.id === focusedDistrict);
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
              <CodebaseOverview />
              <ActivityFeed items={activity.slice(0, 6)} />
            </div>
          </div>

          {/* COMMAND ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 320px 440px', gap: 12, alignItems: 'stretch' }}>
            <Minimap
              districts={DISTRICTS}
              focusedId={focusedDistrict}
              onSelect={(d) => setFocusedDistrict(d.id === focusedDistrict ? null : d.id)}
              pawnCount={pawns?.length || 0}
            />
            <WorkerAgentsRow
              guilds={GUILDS}
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
              onFire={(act) => pushToast({ text: `${act.label} dispatched`, color: act.color, icon: act.icon })}
            />
          </div>

          {/* GUILD ROSTER */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <GuildRoster
              guilds={GUILDS}
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

      {/* TWEAKS */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Connection">
          <TweakToggle
            label="Bitbucket + Jira linked"
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
      </TweaksPanel>
    </div>
  );
}
