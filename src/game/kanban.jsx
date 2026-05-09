// kanban.jsx — local task board, hex/neon styled, with Saga grouping
import React from 'react';
import { NEON, C, alpha } from './palette.js';
import {
  NeonBar, Pill, Mono, Title,
} from './theme.jsx';
import { SKILL_DEFS } from './data.js';
import { QuestSourceBadge } from './panels.jsx';

const LANES = [
  { id: 'todo',        label: 'TO DO',        color: 'ink3' },
  { id: 'in-progress', label: 'IN PROGRESS',  color: 'cyan' },
  { id: 'in-review',   label: 'IN REVIEW',    color: 'magenta' },
  { id: 'blocked',     label: 'BLOCKED',      color: 'red' },
  { id: 'done',        label: 'DONE',         color: 'green' },
];

function KanbanCard({ quest, guilds, sagas, onClick, onOpenAnalysis }) {
  const sk = SKILL_DEFS[quest.skill];
  const a = C(sk.color);
  const saga = sagas.find(s => s.id === quest.saga);
  const adv = quest.adventurer;
  const advObj = adv
    ? guilds.flatMap(g => g.adventurers.map(av => ({ ...av, guild: g }))).find(x => x.id === adv)
    : null;

  return (
    <div
      onClick={() => onClick(quest)}
      style={{
        padding: 8,
        background: NEON.bg1,
        border: `1px solid ${alpha(a, 0.3)}`,
        borderLeft: `3px solid ${a}`,
        cursor: 'pointer',
        transition: 'all .15s',
        position: 'relative',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = alpha(a, 0.7); }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = alpha(a, 0.3); }}
    >
      {saga && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ color: C(saga.color), fontSize: 10 }}>{saga.icon}</span>
          <Mono size={8} color={saga.color} weight={600}>{saga.id}</Mono>
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Mono size={9} color={sk.color} weight={600}>{quest.id}</Mono>
          <QuestSourceBadge source={quest.source} />
        </div>
        <Mono size={9} color={sk.color}>{sk.icon}</Mono>
      </div>
      <Title size={11} color="ink" weight={600} style={{ marginTop: 4, lineHeight: 1.3 }}>
        {quest.title}
      </Title>
      {quest.errands && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Mono size={8} color="ink3">⚐ {quest.errands.filter(e => e.done).length}/{quest.errands.length}</Mono>
          <div style={{ flex: 1, height: 2, background: NEON.line, borderRadius: 1, overflow: 'hidden' }}>
            <div style={{
              width: `${100 * quest.errands.filter(e => e.done).length / quest.errands.length}%`,
              height: '100%', background: a,
            }} />
          </div>
        </div>
      )}
      <div style={{ marginTop: 6, display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {quest.points != null && <Pill color={sk.color}>{quest.points} pt</Pill>}
          {quest.lane === 'in-review' && quest.pr && (
            <Pill color="magenta">RUN #{quest.pr.number}</Pill>
          )}
          {quest.lane === 'blocked' && quest.blockedBy && (
            <Pill color="red">⚠ {quest.blockedBy[0]}</Pill>
          )}
        </div>
        {advObj && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenAnalysis(advObj.id); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '2px 4px',
              background: alpha(C(advObj.guild.color), 0.15),
              border: `1px solid ${alpha(C(advObj.guild.color), 0.4)}`,
              cursor: 'pointer', borderRadius: 2,
            }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: C(advObj.guild.color),
              boxShadow: `0 0 4px ${C(advObj.guild.color)}`,
            }} />
            <Mono size={8} color={advObj.guild.color} weight={600}>{advObj.name}</Mono>
          </button>
        )}
      </div>
    </div>
  );
}

function KanbanLane({ lane, quests, guilds, sagas, onCardClick, onOpenAnalysis }) {
  const a = C(lane.color);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      background: alpha(NEON.bg0, 0.6),
      border: `1px solid ${NEON.line}`,
      borderTop: `2px solid ${a}`,
      padding: 10, minWidth: 0, height: '100%',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Mono color={lane.color} size={10} weight={700} style={{ letterSpacing: 1.5 }}>
          {lane.label}
        </Mono>
        <Pill color={lane.color}>{quests.length}</Pill>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', flex: 1, minHeight: 0 }}>
        {quests.map(q => (
          <KanbanCard key={q.id} quest={q} guilds={guilds} sagas={sagas} onClick={onCardClick} onOpenAnalysis={onOpenAnalysis} />
        ))}
        {quests.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', opacity: 0.5 }}>
            <Mono size={9} color="ink3">— empty —</Mono>
          </div>
        )}
      </div>
    </div>
  );
}

export function KanbanView({ quests, guilds, sagas, onCardClick, onOpenAnalysis, groupBy, onGroupChange }) {
  const orphans = quests.filter(q => !q.saga);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Title size={16} weight={700}>Workspace Board · local project</Title>
        <Pill color="cyan">{quests.length} quests</Pill>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <Mono size={9} color="ink3" style={{ alignSelf: 'center', marginRight: 4 }}>GROUP</Mono>
          {[
            { v: 'none', label: 'None' },
            { v: 'saga', label: 'Saga (Epic)' },
          ].map(o => (
            <button
              key={o.v}
              onClick={() => onGroupChange(o.v)}
              style={{
                fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: 0.6,
                textTransform: 'uppercase', padding: '4px 8px',
                border: `1px solid ${alpha(NEON.cyan, groupBy === o.v ? 0.7 : 0.2)}`,
                background: groupBy === o.v ? alpha(NEON.cyan, 0.15) : 'transparent',
                color: groupBy === o.v ? NEON.cyan : NEON.ink3, cursor: 'pointer', borderRadius: 2,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {groupBy === 'saga' ? (
        <React.Fragment>
          <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(5, 1fr)', gap: 8, padding: '0 10px' }}>
            <Mono size={9} color="ink3">SAGA</Mono>
            {LANES.map(l => (
              <Mono key={l.id} color={l.color} size={10} weight={700} style={{ letterSpacing: 1.5 }}>{l.label}</Mono>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sagas.map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                <div style={{
                  padding: 10,
                  border: `1px solid ${alpha(C(s.color), 0.3)}`,
                  borderLeft: `3px solid ${C(s.color)}`,
                  background: alpha(C(s.color), 0.06),
                }}>
                  <div style={{ fontSize: 16, color: C(s.color) }}>{s.icon}</div>
                  <Mono size={8} color={s.color} weight={600} style={{ marginTop: 4, display: 'block' }}>{s.id}</Mono>
                  <Title size={11} weight={600} style={{ marginTop: 2 }}>{s.title}</Title>
                  <div style={{ marginTop: 6 }}>
                    <NeonBar value={Math.round(s.progress * 100)} color={s.color} sub={`${Math.round(s.progress * 100)}%`} />
                  </div>
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
                  background: alpha(NEON.bg0, 0.4),
                  border: `1px solid ${NEON.line}`,
                  padding: 8,
                }}>
                  {LANES.map(l => {
                    const sagaQuests = quests.filter(q => q.saga === s.id && q.lane === l.id);
                    return (
                      <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `2px solid ${C(l.color)}`, paddingTop: 6 }}>
                        {sagaQuests.map(q => (
                          <KanbanCard key={q.id} quest={q} guilds={guilds} sagas={sagas} onClick={onCardClick} onOpenAnalysis={onOpenAnalysis} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {orphans.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                <div style={{ padding: 10, border: `1px dashed ${NEON.line}`, background: NEON.bg0 }}>
                  <Mono size={9} color="ink3">NO SAGA</Mono>
                  <Title size={11} weight={600} color="ink2" style={{ marginTop: 4 }}>Orphan quests</Title>
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
                  background: alpha(NEON.bg0, 0.4), border: `1px solid ${NEON.line}`, padding: 8,
                }}>
                  {LANES.map(l => (
                    <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `2px solid ${C(l.color)}`, paddingTop: 6 }}>
                      {orphans.filter(q => q.lane === l.id).map(q => (
                        <KanbanCard key={q.id} quest={q} guilds={guilds} sagas={sagas} onClick={onCardClick} onOpenAnalysis={onOpenAnalysis} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </React.Fragment>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, height: 620 }}>
          {LANES.map(l => (
            <KanbanLane
              key={l.id} lane={l}
              quests={quests.filter(q => q.lane === l.id)}
              guilds={guilds} sagas={sagas}
              onCardClick={onCardClick} onOpenAnalysis={onOpenAnalysis}
            />
          ))}
        </div>
      )}
    </div>
  );
}
