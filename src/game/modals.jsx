// modals.jsx — quest detail / accept dialog and post-a-quest modal.
import React from 'react';
import { NEON, C, alpha } from './palette.js';
import {
  Pill, Mono, Title, NButton,
} from './theme.jsx';
import { SKILL_DEFS, DISTRICTS } from './data.js';
import { QuestSourceBadge, QuestCard } from './panels.jsx';

function Backdrop({ onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: alpha(NEON.bg0, 0.85),
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90%' }}>
        {children}
      </div>
    </div>
  );
}

export function QuestDetailModal({ quest, onClose, onAccept, currentGuild }) {
  const sk = SKILL_DEFS[quest.skill];
  const a = C(sk.color);
  const district = DISTRICTS.find(d => d.id === quest.target);
  const isOpen = quest.status === 'open';
  const eligible = isOpen && currentGuild && currentGuild.adventurers.filter(adv => adv.skills.includes(quest.skill));
  const [picked, setPicked] = React.useState(eligible && eligible[0] ? eligible[0].id : null);

  return (
    <Backdrop onClose={onClose}>
      <div style={{
        width: 560, background: NEON.bg1,
        border: `1px solid ${alpha(a, 0.6)}`,
        boxShadow: `0 0 60px ${alpha(a, 0.3)}, 0 30px 80px ${NEON.bg0}`,
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${alpha(a, 0.3)}`,
          background: alpha(a, 0.08), display: 'flex', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: a, fontSize: 18 }}>{sk.icon}</span>
            <QuestSourceBadge source={quest.source} />
            <Mono color={sk.color} size={10} weight={600}>{quest.id}</Mono>
            <Pill color={isOpen ? 'amber' : quest.status === 'active' ? 'green' : 'ink3'}>{quest.status}</Pill>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: NEON.ink3, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>
          <Title size={18} weight={700}>{quest.title}</Title>
          <Mono size={9} color="ink3" style={{ display: 'block', marginTop: 4 }}>
            posted by {quest.posted} · target {quest.target}/{quest.file}
          </Mono>

          <div style={{ marginTop: 12, padding: 10, background: NEON.bg0, border: `1px solid ${NEON.line}` }}>
            <Mono size={9} color="ink2">{quest.desc}</Mono>
          </div>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div>
              <Mono size={8} color="ink3">REWARD</Mono>
              <Title size={16} color="amber" weight={700}>+{quest.reward} XP</Title>
            </div>
            <div>
              <Mono size={8} color="ink3">SKILL REQUIRED</Mono>
              <div style={{ marginTop: 2 }}><Pill color={sk.color}>{sk.icon} {sk.name}</Pill></div>
            </div>
            <div>
              <Mono size={8} color="ink3">DISTRICT</Mono>
              <Title size={12} color={district?.color || 'ink'} weight={600}>{district?.label || quest.target}</Title>
            </div>
          </div>

          {isOpen && eligible && eligible.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${NEON.line}` }}>
              <Mono size={9} color="ink3" style={{ letterSpacing: 1 }}>DISPATCH ADVENTURER FROM {currentGuild.name.toUpperCase()}</Mono>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {eligible.map(adv => (
                  <label key={adv.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                    border: `1px solid ${picked === adv.id ? alpha(a, 0.7) : NEON.line}`,
                    background: picked === adv.id ? alpha(a, 0.1) : 'transparent',
                    cursor: 'pointer',
                  }}>
                    <input type="radio" name="adv" checked={picked === adv.id}
                      onChange={() => setPicked(adv.id)}
                      style={{ accentColor: a }}
                    />
                    <Mono color="ink" weight={600}>{adv.name}</Mono>
                    <Mono size={9} color="ink3">{adv.class} · L{adv.level}</Mono>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                      {adv.skills.map(s => <Pill key={s} color={SKILL_DEFS[s].color}>{SKILL_DEFS[s].icon}</Pill>)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isOpen && (!eligible || eligible.length === 0) && (
            <div style={{ marginTop: 12, padding: 10, border: `1px solid ${alpha(NEON.red, 0.4)}`, background: alpha(NEON.red, 0.06) }}>
              <Mono color="red">no adventurer in your guild has the {sk.name} skill — recruit or train one.</Mono>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <NButton accent="ink3" ghost onClick={onClose}>Close</NButton>
            {isOpen && eligible && eligible.length > 0 && (
              <NButton accent={sk.color} onClick={() => onAccept(quest, picked)}>
                ⚔ Accept Quest
              </NButton>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

export function PostQuestModal({ onClose, onSubmit }) {
  const [form, setForm] = React.useState({
    source: 'local', title: '', desc: '', skill: 'bugfix',
    target: 'lib', file: 'github.ts', reward: 100,
  });
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const a = C('amber');

  return (
    <Backdrop onClose={onClose}>
      <div style={{
        width: 560, background: NEON.bg1,
        border: `1px solid ${alpha(a, 0.6)}`,
        boxShadow: `0 0 60px ${alpha(a, 0.3)}, 0 30px 80px ${NEON.bg0}`,
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${alpha(a, 0.3)}`,
          background: alpha(a, 0.08), display: 'flex', justifyContent: 'space-between',
        }}>
          <Mono color="amber" size={10} weight={600}>✚ POST A QUEST · admin only</Mono>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: NEON.ink3, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          <Field label="SOURCE">
            <div style={{ display: 'flex', gap: 4 }}>
              {['local', 'agent'].map(s => (
                <Choice key={s} active={form.source === s} onClick={() => upd('source', s)}
                  color={s === 'local' ? 'cyan' : 'amber'}>{s.toUpperCase()}</Choice>
              ))}
            </div>
          </Field>

          <Field label="TITLE">
            <Input value={form.title} onChange={v => upd('title', v)} placeholder="Refactor github.ts complexity" />
          </Field>

          <Field label="DESCRIPTION">
            <Input multiline value={form.desc} onChange={v => upd('desc', v)} placeholder="What needs doing, acceptance criteria…" />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="DISTRICT (FOLDER)">
              <Select value={form.target} onChange={v => upd('target', v)}
                options={DISTRICTS.map(d => ({ v: d.id, label: d.name }))} />
            </Field>
            <Field label="FILE">
              <Input value={form.file} onChange={v => upd('file', v)} placeholder="github.ts" />
            </Field>
          </div>

          <Field label="SKILL">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Object.entries(SKILL_DEFS).map(([k, def]) => (
                <Choice key={k} active={form.skill === k} onClick={() => upd('skill', k)} color={def.color}>
                  <span>{def.icon}</span> {def.name}
                </Choice>
              ))}
            </div>
          </Field>

          <Field label="REWARD · XP">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="range" min="20" max="500" step="10" value={form.reward}
                onChange={e => upd('reward', +e.target.value)}
                style={{ flex: 1, accentColor: NEON.amber }}
              />
              <Title size={18} color="amber" weight={700}>+{form.reward}</Title>
            </div>
          </Field>

          <div style={{ marginTop: 4, paddingTop: 10, borderTop: `1px dashed ${NEON.line}` }}>
            <Mono size={8} color="ink3" style={{ letterSpacing: 1 }}>PREVIEW</Mono>
            <div style={{ marginTop: 6 }}>
              <QuestCard
                quest={{
                  id: form.source === 'agent' ? 'RUN-???' : 'TASK-???',
                  source: form.source, title: form.title || '(untitled)',
                  skill: form.skill, reward: form.reward,
                  target: form.target, file: form.file,
                  status: 'open',
                }}
                onSelect={() => {}}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <NButton accent="ink3" ghost onClick={onClose}>Cancel</NButton>
            <NButton accent="amber" disabled={!form.title} onClick={() => onSubmit(form)}>✚ Post Quest</NButton>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Mono size={8} color="ink3" style={{ letterSpacing: 1, display: 'block', marginBottom: 4 }}>{label}</Mono>
      {children}
    </div>
  );
}
function Input({ value, onChange, placeholder, multiline }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', background: NEON.bg0, color: NEON.ink,
        border: `1px solid ${NEON.line}`, borderRadius: 2,
        padding: '6px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        outline: 'none', resize: multiline ? 'vertical' : 'none',
        minHeight: multiline ? 60 : 'auto',
      }}
    />
  );
}
function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', background: NEON.bg0, color: NEON.ink,
        border: `1px solid ${NEON.line}`, borderRadius: 2,
        padding: '6px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
      }}>
      {options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}
function Choice({ active, onClick, color, children }) {
  const a = C(color || 'cyan');
  return (
    <button onClick={onClick} style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: 0.6,
      textTransform: 'uppercase', padding: '4px 8px',
      border: `1px solid ${alpha(a, active ? 0.7 : 0.3)}`,
      background: active ? alpha(a, 0.15) : 'transparent',
      color: active ? a : NEON.ink2, cursor: 'pointer', borderRadius: 2,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>{children}</button>
  );
}

export function LootToast({ toasts }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8,
      alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '8px 16px',
          background: alpha(NEON.bg1, 0.95),
          border: `1px solid ${C(t.color || 'amber')}`,
          boxShadow: `0 0 20px ${alpha(C(t.color || 'amber'), 0.5)}`,
          color: C(t.color || 'amber'),
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600,
          letterSpacing: 1, textTransform: 'uppercase',
          animation: 'toast-rise 0.4s ease-out',
        }}>
          {t.icon || '★'} {t.text}
        </div>
      ))}
    </div>
  );
}
