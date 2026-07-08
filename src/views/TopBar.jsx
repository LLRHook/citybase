import { NEON, alpha } from '../game/palette.js';
import { Pill, Mono, NButton, Title } from '../game/theme.jsx';
import { BranchSelector } from '../game/branchSelector.jsx';

// TopBar — workspace name pill, branch selector, City/Work nav, open/refresh,
// agent install indicators. Always visible. The workspace pill is the only
// "ambient state" surface; everything else is action-or-status.
export function TopBar({
  workspace,
  snapshot,
  onPickWorkspace,
  onRefreshWorkspace,
  onCloseWorkspace,
  selectedBranch,
  onSelectBranch,
  onCheckoutBranch,
  agentDetect,
  citybaseApi,
  view,
  onSetView,
}) {
  const wsOpen = !!workspace;
  // An errored snapshot (not a repo, git missing) is not "linked": the pill
  // must not read green while the city has nothing real behind it (BUG-007).
  const gitBroken = wsOpen && !!snapshot?.error;
  const wsLinked = wsOpen && !gitBroken;
  const wsName = !wsOpen
    ? 'NO WORKSPACE · open one'
    : gitBroken
      ? `WORKSPACE · ${workspace.name} · git error`
      : `WORKSPACE · ${workspace.name}`;
  const liveBranch = snapshot?.branch || null;
  const liveDirty = !!snapshot?.isDirty;
  const fileCount = snapshot?.files?.length || 0;
  const claude = agentDetect?.result?.claude;
  const codex = agentDetect?.result?.codex;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
        background: NEON.bg1,
        borderBottom: `1px solid ${NEON.line}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
        <Title size={13} weight={700} style={{ letterSpacing: 1 }}>CITYBASE</Title>
        <Mono size={9} color="cyan">v3.0</Mono>
      </div>

      <Pill color={wsLinked ? 'green' : gitBroken ? 'amber' : 'red'}>
        <span
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: wsLinked ? NEON.green : gitBroken ? NEON.amber : NEON.red,
            boxShadow: `0 0 4px ${wsLinked ? NEON.green : gitBroken ? NEON.amber : NEON.red}`,
          }}
        />
        {wsName}
      </Pill>

      {wsLinked && (
        <BranchSelector
          workspaceId={workspace.id}
          currentBranch={liveBranch}
          dirty={liveDirty}
          fileCount={fileCount}
          selectedBranch={selectedBranch}
          api={citybaseApi}
          onSelect={onSelectBranch}
          onCheckout={onCheckoutBranch}
        />
      )}

      {wsLinked && onSetView && (
        <SegNav
          value={view}
          onChange={onSetView}
          items={[{ id: 'city', label: '◍ CITY' }, { id: 'work', label: '⚙ WORK' }]}
        />
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <NButton
          accent={wsOpen ? 'cyan' : 'amber'}
          ghost={wsOpen}
          onClick={wsOpen ? onRefreshWorkspace : onPickWorkspace}
        >
          {wsOpen ? '↻ REFRESH' : '＋ OPEN WORKSPACE'}
        </NButton>
        {wsOpen && (
          <NButton accent="ink3" ghost onClick={onCloseWorkspace}>
            ✕ CLOSE
          </NButton>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Mono size={9} color="ink3">AGENTS</Mono>
        <AgentDot label="claude" found={!!claude?.found} detectFailed={agentDetect?.status === 'error'} />
        <AgentDot label="codex" found={!!codex?.found} detectFailed={agentDetect?.status === 'error'} />
      </div>
    </div>
  );
}

// Segmented City/Work toggle. Mono, neon-underlined active segment.
function SegNav({ value, onChange, items }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${NEON.line}`, borderRadius: 3, overflow: 'hidden' }}>
      {items.map((it) => {
        const on = value === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: 1,
              padding: '5px 10px', cursor: 'pointer', border: 'none',
              color: on ? NEON.cyan : NEON.ink3,
              background: on ? alpha(NEON.cyan, 0.14) : 'transparent',
              boxShadow: on ? `inset 0 -2px 0 ${NEON.cyan}` : 'none',
              transition: 'all .12s',
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function AgentDot({ label, found, detectFailed }) {
  const color = found ? NEON.green : NEON.red;
  return (
    <span
      role="status"
      data-agent={label}
      data-state={found ? 'ok' : 'bad'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
        color: NEON.ink2,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: color, boxShadow: `0 0 4px ${color}`,
        }}
      />
      {label}
      <span style={{ color: NEON.ink3, marginLeft: 2 }}>
        {found ? 'installed' : detectFailed ? 'detect failed' : 'not installed'}
      </span>
    </span>
  );
}
