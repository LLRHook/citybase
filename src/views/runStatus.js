// runStatus — small helpers shared by every view that renders a run.
// Centralizing color + formatting so the sidebar and the detail screen
// stay visually consistent.
export const STATUS_COLOR = Object.freeze({
  running: 'cyan',
  done: 'green',
  failed: 'red',
  cancelled: 'amber',
});

export function formatStartedAt(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function shortRunId(runId) {
  return typeof runId === 'string' ? runId.slice(0, 8) : '';
}
