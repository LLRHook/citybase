import { NEON, alpha } from '../game/palette.js';
import { Mono, NButton, Title } from '../game/theme.jsx';

// EmptyHome — what fills the main area before the user opens a workspace.
// One-screen onboarding: explain what citybase does, give the user the
// big button to pick a folder, surface agent-install state honestly.
export function EmptyHome({ onPickWorkspace, agentDetect }) {
  const claude = agentDetect?.result?.claude;
  const codex = agentDetect?.result?.codex;
  return (
    <div
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40,
      }}
    >
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <Title size={26} weight={700} style={{ letterSpacing: -0.5 }}>
          Open a Git workspace
        </Title>
        <Mono size={12} color="ink2" style={{ display: 'block', marginTop: 10, lineHeight: 1.6 }}>
          Citybase is a desktop shell around your local Git repo and the Claude Code
          CLI. Pick a folder, write a prompt, and the agent runs in your workspace.
        </Mono>

        <div style={{ marginTop: 22, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <NButton accent="amber" onClick={onPickWorkspace}>
            ＋ Open Workspace
          </NButton>
        </div>

        <div
          style={{
            marginTop: 28, padding: 14,
            border: `1px solid ${NEON.line}`,
            background: alpha(NEON.bg0, 0.6),
            borderRadius: 4,
            display: 'flex', flexDirection: 'column', gap: 6,
            textAlign: 'left',
          }}
        >
          <Mono size={9} color="ink3" style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
            Prerequisites
          </Mono>
          <AgentRow
            name="claude"
            found={!!claude?.found}
            path={claude?.path}
            detectError={agentDetect?.status === 'error' ? agentDetect.error : null}
            hint="Required. Install Claude Code CLI and run `claude login`."
          />
          <AgentRow
            name="codex"
            found={!!codex?.found}
            path={codex?.path}
            detectError={agentDetect?.status === 'error' ? agentDetect.error : null}
            hint="Optional. Codex is a fallback adapter."
          />
        </div>
      </div>
    </div>
  );
}

// A detect *error* is not "not installed" (R17): when the scan itself failed
// we don't know what's installed, so say that — and skip the install hint.
function AgentRow({ name, found, path, hint, detectError }) {
  const color = found ? NEON.green : NEON.red;
  return (
    <div
      role="status"
      data-agent={name}
      data-state={found ? 'ok' : 'bad'}
      style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: color, boxShadow: `0 0 4px ${color}`,
          alignSelf: 'center',
        }}
      />
      <Mono size={11} color="ink" weight={600}>{name}</Mono>
      <Mono size={10} color={found ? 'green' : 'red'}>
        {found ? `installed · ${path || '(detected)'}`
          : detectError ? `detect failed: ${detectError.message}`
          : 'not installed'}
      </Mono>
      {!found && !detectError && (
        <Mono size={10} color="ink3" style={{ marginLeft: 'auto' }}>{hint}</Mono>
      )}
    </div>
  );
}
