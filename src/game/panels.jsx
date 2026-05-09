// panels.jsx — quest board, guild roster, character sheet, activity feed.
import {
  NEON, C, alpha, hexPath,
  Panel, NeonBar, Pill, Mono, Title, NButton, Crest,
} from './theme.jsx';
import { SKILL_DEFS, hpFromContext, fmtTokens } from './data.js';

function questIcon(skill) {
  return SKILL_DEFS[skill] || { icon: '◆', color: 'ink2' };
}

export function QuestSourceBadge({ source }) {
  if (source === 'jira') return <Pill color="cyan">JIRA</Pill>;
  if (source === 'bitbucket') return <Pill color="amber">BITBUCKET</Pill>;
  return <Pill>{source}</Pill>;
}

export function QuestCard({ quest, onSelect }) {
  const sk = questIcon(quest.skill);
  const a = C(sk.color);
  const isActive = quest.status === 'active';
  const isDone = quest.status === 'done';
  return (
    <div
      onClick={() => onSelect(quest)}
      style={{
        padding: '8px 10px',
        border: `1px solid ${alpha(a, isActive ? 0.5 : 0.25)}`,
        background: isActive ? alpha(a, 0.06) : NEON.bg1,
        borderLeft: `3px solid ${a}`,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all .15s',
        opacity: isDone ? 0.55 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = alpha(a, 0.1); }}
      onMouseLeave={e => { e.currentTarget.style.background = isActive ? alpha(a, 0.06) : NEON.bg1; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          <span style={{ color: a, fontSize: 14, lineHeight: 1 }}>{sk.icon}</span>
          <Mono size={9} color={sk.color} weight={600}>{quest.id}</Mono>
          <QuestSourceBadge source={quest.source} />
        </div>
        <Mono size={9} color={sk.color} weight={600}>+{quest.reward} XP</Mono>
      </div>
      <Title size={12} color="ink" weight={600} style={{ marginTop: 4, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {quest.title}
      </Title>
      <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Mono size={8} color="ink3">→ {quest.target}/{quest.file}</Mono>
      </div>
      {isActive && (
        <div style={{ marginTop: 6 }}>
          <NeonBar value={Math.round(quest.progress * 100)} color={sk.color} sub={`${Math.round(quest.progress * 100)}% · ETA ${quest.eta}`} />
        </div>
      )}
      {isDone && <div style={{ position: 'absolute', top: 6, right: 8 }}><Pill color="green">DONE</Pill></div>}
    </div>
  );
}

export function QuestBoard({ quests, onSelect, role, onPostQuest, filter, onFilterChange }) {
  const filters = ['open', 'active', 'done'];
  const visible = quests.filter(q => q.status === filter);
  return (
    <Panel
      title="Quest Board · Bitbucket + Jira"
      accent="cyan"
      headerRight={
        <div style={{ display: 'flex', gap: 4 }}>
          {filters.map(f => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 8, letterSpacing: 0.8,
                textTransform: 'uppercase', padding: '2px 6px',
                border: `1px solid ${alpha(NEON.cyan, filter === f ? 0.7 : 0.2)}`,
                background: filter === f ? alpha(NEON.cyan, 0.15) : 'transparent',
                color: filter === f ? NEON.cyan : NEON.ink3, cursor: 'pointer', borderRadius: 2,
              }}
            >
              {f} · {quests.filter(q => q.status === f).length}
            </button>
          ))}
        </div>
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', flex: 1, minHeight: 0, paddingRight: 4 }}>
        {visible.map(q => <QuestCard key={q.id} quest={q} onSelect={onSelect} />)}
        {visible.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <Mono color="ink3">no quests in this state</Mono>
          </div>
        )}
      </div>
      {role === 'admin' && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${NEON.line}` }}>
          <NButton accent="amber" onClick={onPostQuest} style={{ width: '100%', justifyContent: 'center' }} kbd="Q">
            ✚ Post a Quest
          </NButton>
        </div>
      )}
    </Panel>
  );
}

function GuildRow({ guild, expanded, onToggle, onSelectAdv, selectedAdv }) {
  const a = C(guild.color);
  return (
    <div style={{ borderTop: `1px solid ${NEON.line}` }}>
      <div onClick={() => onToggle(guild.id)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', cursor: 'pointer' }}>
        <Crest letter={guild.crest} color={guild.color} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Title size={12} weight={600}>{guild.name}</Title>
          <Mono size={8} color="ink3">{guild.author} · {guild.handle} · {guild.commits} commits</Mono>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Mono size={9} color={guild.color} weight={600}>LV {guild.level}</Mono>
          <div style={{ width: 50, marginTop: 2 }}>
            <NeonBar value={guild.xp} max={guild.xpNext} color={guild.color} />
          </div>
        </div>
        <span style={{ color: NEON.ink3, fontFamily: 'JetBrains Mono', fontSize: 12, marginLeft: 4 }}>{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div style={{ paddingLeft: 38, paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {guild.adventurers.map(adv => {
            const isSel = selectedAdv && selectedAdv.id === adv.id;
            const statusColor = adv.status === 'questing' ? 'amber' : adv.status === 'active' ? 'green' : 'ink3';
            return (
              <div key={adv.id} onClick={() => onSelectAdv(adv, guild)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                  border: `1px solid ${isSel ? alpha(a, 0.7) : NEON.line}`,
                  background: isSel ? alpha(a, 0.1) : NEON.bg1,
                  cursor: 'pointer', borderRadius: 2,
                }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: C(statusColor),
                  boxShadow: `0 0 4px ${C(statusColor)}`,
                }} />
                <Mono size={10} color="ink" weight={600}>{adv.name}</Mono>
                <Mono size={8} color="ink3">· {adv.class}</Mono>
                <span style={{ marginLeft: 'auto' }}><Mono size={9} color={guild.color}>L{adv.level}</Mono></span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GuildRoster({ guilds, expandedGuilds, onToggleGuild, selectedAdv, onSelectAdv }) {
  return (
    <Panel
      title="Adventurer Guilds · authors"
      accent="magenta"
      headerRight={<Pill color="magenta">{guilds.length} guilds · {guilds.reduce((n, g) => n + g.adventurers.length, 0)} adv</Pill>}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0, marginTop: -8 }}>
        {guilds.map(g => (
          <GuildRow
            key={g.id} guild={g}
            expanded={expandedGuilds.has(g.id)}
            onToggle={onToggleGuild}
            selectedAdv={selectedAdv}
            onSelectAdv={onSelectAdv}
          />
        ))}
      </div>
    </Panel>
  );
}

export function CharacterSheet({ adv, guild }) {
  if (!adv) {
    return (
      <Panel title="Adventurer · idle" accent="ink3" style={{ height: '100%' }}>
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <Mono color="ink3">select an adventurer from a guild</Mono>
        </div>
      </Panel>
    );
  }
  const a = C(guild.color);
  const hp = hpFromContext(adv);
  return (
    <Panel
      title={`${adv.name} · ${adv.class}`}
      accent={guild.color}
      headerRight={<Pill color={adv.status === 'questing' ? 'amber' : 'green'}>{adv.status}</Pill>}
      style={{ height: '100%' }}
    >
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{
          width: 72, height: 96, position: 'relative',
          background: `linear-gradient(180deg, ${alpha(a, 0.2)}, ${NEON.bg0})`,
          border: `1px solid ${alpha(a, 0.5)}`,
        }}>
          <svg width="72" height="96" viewBox="0 0 72 96" style={{ position: 'absolute', inset: 0 }}>
            <path d={hexPath(36, 30, 16)} fill={alpha(a, 0.2)} stroke={a} strokeWidth="1" />
            <circle cx="36" cy="30" r="8" fill={a} />
            <rect x="22" y="44" width="28" height="32" rx="2" fill={alpha(a, 0.4)} stroke={a} strokeWidth="1" />
            <rect x="28" y="50" width="16" height="3" fill={NEON.bg0} />
            <rect x="28" y="56" width="16" height="3" fill={NEON.bg0} />
            <rect x="28" y="62" width="16" height="3" fill={NEON.bg0} />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Mono size={9} color="ink3">{guild.name} · LV {adv.level}</Mono>
          <Title size={14} color="ink" style={{ marginTop: 2 }}>{adv.name}</Title>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <NeonBar
              label="HP · context free"
              value={hp}
              color={hp > 60 ? 'green' : hp > 30 ? 'amber' : 'red'}
              sub={`${fmtTokens((adv.maxContext || 0) - (adv.contextUsed || 0))} / ${fmtTokens(adv.maxContext || 0)}`}
            />
            <NeonBar label="MP · focus" value={adv.mp} color="cyan" />
            <NeonBar label="XP" value={adv.xp} max={adv.xpNext} color={guild.color} sub={`${adv.xp}/${adv.xpNext}`} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <Mono size={8} color="ink3" style={{ letterSpacing: 1 }}>SKILLS</Mono>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {adv.skills.map(sk => {
            const def = SKILL_DEFS[sk];
            return (
              <Pill key={sk} color={def.color}>
                <span>{def.icon}</span>{def.name}
              </Pill>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function ActivityFeed({ items }) {
  const map = { good: 'green', bad: 'red', xp: 'amber', quest: 'cyan' };
  const sigil = { good: '✓', bad: '✕', xp: '★', quest: '◆' };
  return (
    <Panel title="Activity Feed" accent="cyan" style={{ height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'JetBrains Mono', fontSize: 9, lineHeight: 1.5 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, color: NEON.ink2 }}>
            <span style={{ color: NEON.ink3, width: 32 }}>{it.t}</span>
            <span style={{ color: C(map[it.kind]) }}>{sigil[it.kind]}</span>
            <span>{it.text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function VitalsBar({ stats, repo }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center', padding: '8px 14px',
      background: `linear-gradient(180deg, ${NEON.bg1}, ${NEON.bg0})`,
      border: `1px solid ${NEON.line}`,
      borderRadius: 4,
    }}>
      <div>
        <Mono size={8} color="ink3">REPO · BITBUCKET</Mono>
        <Title size={14} weight={700} color="ink">{repo.name}</Title>
        <Mono size={8} color="ink3">{repo.remote} · {repo.branch} · {repo.commit}</Mono>
      </div>
      <div style={{ width: 1, height: 36, background: NEON.line }} />
      {stats.map((s, i) => (
        <div key={i} style={{ minWidth: 90 }}>
          <Mono size={8} color="ink3" style={{ letterSpacing: 1 }}>{s.label}</Mono>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <Title size={18} color={s.color} weight={700}>{s.value}</Title>
            {s.unit && <Mono size={9} color={s.color}>{s.unit}</Mono>}
          </div>
        </div>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: NEON.green,
          boxShadow: `0 0 8px ${NEON.green}`, animation: 'pulse 2s infinite',
        }} />
        <Mono size={9} color="green" weight={600}>LIVE · 24:17</Mono>
      </div>
    </div>
  );
}
