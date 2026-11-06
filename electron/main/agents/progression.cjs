// Recorded profile XP is independent of the bounded activity/history views.
const XP_BY_STATUS = { done: 25, failed: 5, cancelled: 2 };

function xpForStatus(status) {
  return Object.hasOwn(XP_BY_STATUS, status) ? XP_BY_STATUS[status] : 0;
}

function progressionFromRuns(runs) {
  const unique = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    if (run && typeof run.runId === 'string') unique.set(run.runId, run);
  }
  return { xp: [...unique.values()].reduce((xp, run) => xp + xpForStatus(run.status), 0) };
}

function normalizeProgression(progression, runs) {
  const observed = progressionFromRuns(runs).xp;
  const xp = progression?.xp;
  return { xp: Number.isSafeInteger(xp) && xp >= 0 ? Math.max(xp, observed) : observed };
}

module.exports = { xpForStatus, normalizeProgression };
