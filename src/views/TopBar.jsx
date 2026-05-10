import { NEON } from '../game/palette.js';
import { Pill, Mono, NButton, Title } from '../game/theme.jsx';
import { BranchSelector } from '../game/branchSelector.jsx';

// TopBar — workspace name pill, branch selector, open/refresh, agent
// install indicators. Always visible. The workspace pill is the only
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
}) {
  const wsLinked = !!workspace;
  const wsName = wsLinked ? `WORKSPACE · ${workspace.name}` : 'NO WORKSPACE · open one';
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
        <Mono size={9} color="ink3">v0.2</Mono>
      </div>

      <Pill color={wsLinked ? 'green' : 'red'}>
        <span
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: wsLinked ? NEON.green : NEON.red,
            boxShadow: `0 0 4px ${wsLinked ? NEON.green : NEON.red}`,
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

      <div style={{ display: 'flex', gap: 6 }}>
        <NButton
          accent={wsLinked ? 'cyan' : 'amber'}
          ghost={wsLinked}
          onClick={wsLinked ? onRefreshWorkspace : onPickWorkspace}
        >
          {wsLinked ? '↻ REFRESH' : '＋ OPEN WORKSPACE'}
        </NButton>
        {wsLinked && (
          <NButton accent="ink3" ghost onClick={onCloseWorkspace}>
            ✕ CLOSE
          </NButton>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Mono size={9} color="ink3">AGENTS</Mono>
        <AgentDot label="claude" found={!!claude?.found} />
        <AgentDot label="codex" found={!!codex?.found} />
      </div>
    </div>
  );
}

function AgentDot({ label, found }) {
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
        {found ? 'installed' : 'not installed'}
      </span>
    </span>
  );
}
