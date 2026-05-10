// modals.jsx — top-level overlays for the IDE shell.
//
// Pre-rewrite this file shipped QuestDetailModal / PostQuestModal — the
// game-themed quest editor — alongside ApprovalModal and LootToast. The
// quest modals are gone with the metaphor; what stays is the runtime
// machinery the agent runtime contract actually needs.
import { NEON, C, alpha } from './palette.js';
import { Mono, Title, NButton } from './theme.jsx';

function Backdrop({ onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: alpha(NEON.bg0, 0.85),
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90%' }}>
        {children}
      </div>
    </div>
  );
}

// Surface for the approval requests an adapter raises before applying
// file changes. Per docs/agent-runtime.md the manager pauses on
// requestApproval; this modal is what releases that promise via the
// renderer-side approve / reject methods on citybaseApi.agents.
export function ApprovalModal({ pending, onApprove, onReject }) {
  if (!pending) return null;
  const a = C('amber');
  const summary = pending.summary || {};
  return (
    <Backdrop onClose={onReject}>
      <div style={{
        width: 480, background: NEON.bg1,
        border: `1px solid ${alpha(a, 0.6)}`,
        boxShadow: `0 0 60px ${alpha(a, 0.3)}, 0 30px 80px ${NEON.bg0}`,
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${alpha(a, 0.3)}`,
          background: alpha(a, 0.08), display: 'flex', justifyContent: 'space-between',
        }}>
          <Mono color="amber" size={10} weight={600}>⚠ AGENT REQUESTS APPROVAL</Mono>
          <Mono color="ink3" size={9}>{pending.runId}</Mono>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Title size={14} weight={700}>Agent is about to apply file changes</Title>
          {summary.text && (
            <Mono size={11} color="ink2" style={{ display: 'block', lineHeight: 1.5 }}>
              {summary.text}
            </Mono>
          )}
          {Array.isArray(summary.files) && summary.files.length > 0 && (
            <div style={{ padding: 10, background: NEON.bg0, border: `1px solid ${NEON.line}` }}>
              <Mono size={9} color="ink3" style={{ letterSpacing: 1, display: 'block', marginBottom: 6 }}>
                {summary.files.length} FILE{summary.files.length === 1 ? '' : 'S'} TO TOUCH
              </Mono>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {summary.files.map((f, i) => (
                  <Mono key={i} size={10} color="ink">· {f}</Mono>
                ))}
              </div>
            </div>
          )}
          <Mono size={9} color="ink3" style={{ display: 'block' }}>
            Approving lets the agent write to the workspace. Rejecting cancels this step
            without disturbing the rest of the run.
          </Mono>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <NButton accent="ink3" ghost onClick={onReject}>✕ Reject</NButton>
            <NButton accent="green" onClick={onApprove}>✓ Approve</NButton>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

// Bottom-of-screen transient notifications. Used for "Run dispatched",
// "Checkout failed: <message>", etc.
export function Toasts({ toasts }) {
  if (!Array.isArray(toasts) || toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8,
      alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          padding: '8px 16px',
          background: alpha(NEON.bg1, 0.95),
          border: `1px solid ${C(t.color || 'amber')}`,
          boxShadow: `0 0 20px ${alpha(C(t.color || 'amber'), 0.5)}`,
          color: C(t.color || 'amber'),
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          {t.icon || '★'} {t.text}
        </div>
      ))}
    </div>
  );
}
