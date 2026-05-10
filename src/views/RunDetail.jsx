import React from 'react';
import { NEON, alpha } from '../game/palette.js';
import { Panel, Pill, Mono, Title, NButton } from '../game/theme.jsx';
import { STATUS_COLOR, formatStartedAt, shortRunId } from './runStatus.js';
import { useRunEvents } from '../app/useRunEvents.js';

// RunDetail — main column when a run is selected from the sidebar.
// Shows status header, prompt summary, the live event stream (filtered
// to this runId), and lazy-loaded diff + checks panels. PR creation
// is a single button at the top — it shells out to gh on the main
// process via citybaseApi.agents.openPR.
export function RunDetail({
  run,
  citybaseApi,
  onCancelRun,
  onCloseRun,
  workspaceBranch,
}) {
  const events = useRunEvents(run?.runId, { api: citybaseApi });
  const [diff, setDiff] = React.useState(null);
  const [diffErr, setDiffErr] = React.useState(null);
  const [checks, setChecks] = React.useState(null);
  const [checksErr, setChecksErr] = React.useState(null);
  const [prInfo, setPrInfo] = React.useState(null);
  const [prErr, setPrErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const isTerminal = run && (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled');

  // Auto-load diff + checks once the run hits a terminal state. Both are
  // best-effort; we surface the error inline rather than crash the view.
  React.useEffect(() => {
    if (!run || !isTerminal) return undefined;
    let alive = true;
    citybaseApi.agents.produceDiff(run.runId).then(
      (d) => { if (alive) setDiff(d); },
      (err) => { if (alive) setDiffErr(err?.message || String(err)); },
    );
    citybaseApi.agents.runChecks(run.runId).then(
      (c) => { if (alive) setChecks(c); },
      (err) => { if (alive) setChecksErr(err?.message || String(err)); },
    );
    return () => { alive = false; };
  }, [run, isTerminal, citybaseApi]);

  if (!run) return null;

  const color = STATUS_COLOR[run.status] || 'ink2';
  const submitPr = async () => {
    if (busy) return;
    setBusy(true);
    setPrErr(null);
    try {
      const out = await citybaseApi.agents.openPR(run.runId, {
        title: `agent run ${shortRunId(run.runId)}`,
        body: '',
        sourceBranch: run.branch || workspaceBranch || 'main',
        targetBranch: 'main',
      });
      setPrInfo(out);
    } catch (err) {
      setPrErr(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ flex: 1, padding: 18, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill color={color}>{run.status}</Pill>
            <Mono size={10} color="ink2">{run.provider || 'claude'}</Mono>
            {run.branch && <Mono size={10} color="ink3">· {run.branch}</Mono>}
            {run.startedAt && <Mono size={10} color="ink3">· {formatStartedAt(run.startedAt)}</Mono>}
          </div>
          <Title size={18} weight={700} style={{ marginTop: 4 }}>
            Run {shortRunId(run.runId)}
          </Title>
          <Mono size={10} color="ink3" style={{ display: 'block', marginTop: 2 }}>
            {run.questId || '(no quest)'}
            {run.adventurerId ? ` · ${run.adventurerId}` : ''}
          </Mono>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isTerminal && onCancelRun && (
            <NButton accent="amber" onClick={() => onCancelRun(run.runId)}>✕ Cancel</NButton>
          )}
          {isTerminal && (
            <NButton accent="cyan" onClick={submitPr} disabled={busy}>
              {busy ? 'Opening…' : '↗ Open PR (gh)'}
            </NButton>
          )}
          <NButton accent="ink3" ghost onClick={onCloseRun}>← Back</NButton>
        </div>
      </div>

      {prInfo && (
        <Panel title="Pull Request" accent="cyan" style={{ marginTop: 14 }}>
          <Mono size={11} color="ink2">PR #{prInfo.prNumber} · {prInfo.url}</Mono>
        </Panel>
      )}
      {prErr && (
        <Panel title="Pull Request error" accent="red" style={{ marginTop: 14 }}>
          <Mono size={11} color="red">{prErr}</Mono>
          <Mono size={10} color="ink3" style={{ display: 'block', marginTop: 6 }}>
            v1 deliberately doesn't auto-push. If gh complained about the head branch
            having no upstream, run <code>git push -u origin {run.branch || '<branch>'}</code> in
            your terminal first.
          </Mono>
        </Panel>
      )}

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Panel title="Events" accent={color}>
          <EventLog events={events} runStatus={run.status} />
        </Panel>
        <Panel title="CI Checks" accent="amber">
          <ChecksList checks={checks} error={checksErr} loading={!isTerminal} />
        </Panel>
      </div>

      <Panel title="Diff" accent="green" style={{ marginTop: 12 }}>
        <DiffView diff={diff} error={diffErr} loading={!isTerminal} />
      </Panel>
    </div>
  );
}

function EventLog({ events, runStatus }) {
  if (!Array.isArray(events) || events.length === 0) {
    if (runStatus === 'running') {
      return <Mono size={10} color="ink3">waiting for first event…</Mono>;
    }
    return <Mono size={10} color="ink3">no events</Mono>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {events.map((e, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: 6,
            background: alpha(NEON.bg0, 0.5),
            border: `1px solid ${NEON.line}`,
          }}
        >
          <Pill color={e.kind === 'error' ? 'red' : 'cyan'}>{e.kind}</Pill>
          <Mono size={9} color="ink3">{e.t}</Mono>
          <Mono size={11} color="ink" style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {e.text}
          </Mono>
        </div>
      ))}
    </div>
  );
}

function DiffView({ diff, error, loading }) {
  if (loading) return <Mono size={10} color="ink3">diff loads when the run completes…</Mono>;
  if (error) return <Mono size={10} color="red">{error}</Mono>;
  if (!diff || !Array.isArray(diff.files) || diff.files.length === 0) {
    return <Mono size={10} color="ink3">no file changes</Mono>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {diff.files.map((f, i) => {
        const kindColor = { add: 'green', modify: 'amber', delete: 'red' }[f.kind] || 'cyan';
        return (
          <div key={i} style={{ border: `1px solid ${NEON.line}`, padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pill color={kindColor}>{f.kind}</Pill>
              <Mono size={11} color="ink">{f.file}</Mono>
              <Mono size={9} color="ink3" style={{ marginLeft: 'auto' }}>
                +{f.additions} / -{f.deletions}
              </Mono>
            </div>
            {Array.isArray(f.hunks) && f.hunks.length > 0 && (
              <pre
                style={{
                  marginTop: 6, fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11, color: NEON.ink2,
                  background: NEON.bg0, padding: 8, overflowX: 'auto',
                  maxHeight: 240,
                }}
              >
                {f.hunks.slice(0, 60).map((h, j) => {
                  const c = h.type === 'add' ? NEON.green : h.type === 'del' ? NEON.red : NEON.ink3;
                  return (
                    <div key={j} style={{ color: c }}>
                      {h.type === 'add' ? '+ ' : h.type === 'del' ? '- ' : '  '}
                      {h.code}
                    </div>
                  );
                })}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChecksList({ checks, error, loading }) {
  if (loading) return <Mono size={10} color="ink3">checks run when the agent finishes…</Mono>;
  if (error) return <Mono size={10} color="red">{error}</Mono>;
  if (!Array.isArray(checks) || checks.length === 0) {
    return <Mono size={10} color="ink3">no checks declared in package.json</Mono>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {checks.map((c, i) => {
        const color = c.state === 'pass' ? 'green' : c.state === 'warn' ? 'amber' : 'red';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Pill color={color}>{c.state}</Pill>
            <Mono size={11} color="ink">{c.name}</Mono>
            <Mono size={9} color="ink3" style={{ marginLeft: 'auto' }}>{c.meta}</Mono>
          </div>
        );
      })}
    </div>
  );
}
