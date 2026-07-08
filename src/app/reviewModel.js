// reviewModel.js — pure projection from a run's diff + checks to the
// no-code review surface (ROADMAP Phase 4): changed districts, churn
// totals, and a coarse risk level. Speaks the same language as the city
// (top-level folder = district, repo-root files = 'core'). No React,
// no DOM: fully unit-testable.

function districtKeyFor(filePath) {
  if (typeof filePath !== 'string' || !filePath) return 'core';
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const slash = normalized.indexOf('/');
  return slash === -1 ? 'core' : normalized.slice(0, slash);
}

/**
 * Group diff files by city district, busiest first.
 * @param {Array<{file: string, kind: string, additions?: number, deletions?: number}>} files
 * @returns {Array<{district: string, files: object[], additions: number, deletions: number, kinds: string[]}>}
 */
export function groupDiffByDistrict(files) {
  if (!Array.isArray(files) || files.length === 0) return [];
  const byDistrict = new Map();
  for (const f of files) {
    if (!f || typeof f.file !== 'string') continue;
    const key = districtKeyFor(f.file);
    const entry = byDistrict.get(key) || { district: key, files: [], additions: 0, deletions: 0, kinds: [] };
    entry.files.push(f);
    entry.additions += Number(f.additions) || 0;
    entry.deletions += Number(f.deletions) || 0;
    if (f.kind && !entry.kinds.includes(f.kind)) entry.kinds.push(f.kind);
    byDistrict.set(key, entry);
  }
  return [...byDistrict.values()].sort((a, b) => {
    const churn = (d) => d.additions + d.deletions;
    return churn(b) - churn(a) || b.files.length - a.files.length || a.district.localeCompare(b.district);
  });
}

/**
 * Coarse risk assessment for the outcome summary. Deliberately simple and
 * explainable: every escalation carries a human-readable reason.
 * @param {{ files?: object[], checks?: Array<{state: string}> }} input
 * @returns {{ level: 'low'|'medium'|'high', reasons: string[] }}
 */
export function assessRisk({ files = [], checks = null } = {}) {
  const reasons = [];
  const rank = { low: 0, medium: 1, high: 2 };
  let level = 'low';
  const bump = (to, reason) => {
    reasons.push(reason);
    if (rank[to] > rank[level]) level = to;
  };

  const list = Array.isArray(files) ? files : [];
  const churn = list.reduce((n, f) => n + (Number(f?.additions) || 0) + (Number(f?.deletions) || 0), 0);
  const deletions = list.filter((f) => f?.kind === 'delete').length;
  const districts = groupDiffByDistrict(list).length;

  if (list.length > 8) bump('high', `${list.length} files changed`);
  else if (list.length > 3) bump('medium', `${list.length} files changed`);

  if (churn > 400) bump('high', `${churn} lines of churn`);
  else if (churn > 120) bump('medium', `${churn} lines of churn`);

  if (deletions > 0) bump('medium', `${deletions} file${deletions === 1 ? '' : 's'} deleted`);
  if (districts > 3) bump('medium', `${districts} districts touched`);

  if (Array.isArray(checks)) {
    if (checks.some((c) => c?.state === 'fail')) bump('high', 'checks failing');
    else if (checks.some((c) => c?.state === 'warn')) bump('medium', 'checks warning');
  }

  if (reasons.length === 0) reasons.push('small, contained change');
  return { level, reasons };
}
