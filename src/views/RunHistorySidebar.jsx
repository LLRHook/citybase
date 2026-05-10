import { NEON, alpha } from '../game/palette.js';
import { Mono, Pill } from '../game/theme.jsx';
import { STATUS_COLOR, formatStartedAt, shortRunId } from './runStatus.js';

// RunHistorySidebar — left column. Lists the agent runs the current
// session has dispatched (real, no seed data). Click a row to focus
// the RunDetail view on that run.
export function RunHistorySidebar({ runs, selectedRunId, onSelectRun }) {
  const empty = !Array.isArray(runs) || runs.length === 0;
  return (
    <aside
      style={{
        display: 'flex', flexDirection: 'column',
        background: NEON.bg1, borderRight: `1px solid ${NEON.line}`,
        minWidth: 260, maxWidth: 320,
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${NEON.line}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Mono size={10} color="cyan" weight={600} style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>
          ◆ Run History
        </Mono>
        {!empty && <Mono size={9} color="ink3">{runs.length}</Mono>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
        {empty && (
          <div style={{ padding: '24px 12px', textAlign: 'center' }}>
            <Mono size={10} color="ink3">
              no runs yet · dispatch claude on the right
            </Mono>
          </div>
        )}

        {!empty && runs.map((r) => {
          const sel = r.runId === selectedRunId;
          const color = STATUS_COLOR[r.status] || 'ink2';
          return (
            <button
              key={r.runId}
              data-testid="run-history-row"
              onClick={() => onSelectRun?.(r.runId)}
              style={{
                width: '100%', textAlign: 'left',
                margin: '0 0 4px 0', padding: 8,
                border: `1px solid ${sel ? NEON.cyan : NEON.line}`,
                background: sel ? alpha(NEON.cyan, 0.08) : alpha(NEON.bg0, 0.5),
                cursor: 'pointer', borderRadius: 2,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Pill color={color}>{r.status}</Pill>
                <Mono size={9} color="ink2">{r.provider}</Mono>
                <Mono size={9} color="ink3" style={{ marginLeft: 'auto' }}>
                  {formatStartedAt(r.startedAt)}
                </Mono>
              </div>
              <Mono size={9} color="ink3">
                {r.questId || '(no quest)'} · {shortRunId(r.runId)}
                {r.branch ? ` · ${r.branch}` : ''}
              </Mono>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
