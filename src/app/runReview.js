// runReview — pure projection from an AgentRun + its produceDiff and
// runChecks output into the visual-review summary the no-code analysis
// screen consumes. The screen never renders raw code as the primary
// view; this module shapes everything it needs.
//
// Inputs:
//   run        — AgentRun (runId, status, branch, ...)
//   diff       — { files: DiffFile[] } from AgentProvider.produceDiff
//   checks     — CheckResult[] from AgentProvider.runChecks
//   districts  — array of city districts (from cityModel) used to map
//                changed files to district pills
//   intent     — optional string (original prompt summary)
//
// Output:
//   { runId, intent, status, changedDistricts, checks, riskLevel,
//     riskScore, riskFactors, nextAction }
//
// Risk model is intentionally simple: a weighted sum of flags. The UI
// renders the score + factors; the model can grow more sophisticated
// without changing the contract.

const CONFIG_PATTERN = /(^|\/)(package\.json|\.github\/|\.eslintrc|vite\.config\.|tsconfig\.json|tsconfig\.|electron-builder\.|webpack\.config\.|rollup\.config\.|babel\.config\.|jest\.config\.|vitest\.config\.|tailwind\.config\.|postcss\.config\.)/i;
const SECRET_PATTERN = /(secret|password|token|credential|api[-_]?key)/i;
const ENV_FILE_PATTERN = /(^|\/)\.env(\.|$)/i;

// Bands chosen so a single failed check (+30) lands at MEDIUM and two
// failed checks (cap +60) land at HIGH — failures should always escalate.
const LOW_FLOOR = 0;
const MEDIUM_FLOOR = 30;
const HIGH_FLOOR = 60;

function topLevelOf(p) {
  if (typeof p !== 'string' || p.length === 0) return null;
  const i = p.indexOf('/');
  return i === -1 ? null : p.slice(0, i);
}

function districtIdFor(folderName) {
  return folderName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

// Group diff files by the district they live under. Files at the repo
// root land under 'core' if a core district exists, else 'core' synthetic.
function groupChangedFiles(diffFiles, districts) {
  const known = new Set((districts || []).map((d) => d.id));
  const buckets = new Map();
  const districtName = (id) => {
    const found = (districts || []).find((d) => d.id === id);
    return found ? found.name : id;
  };

  for (const f of diffFiles || []) {
    if (!f || typeof f.file !== 'string') continue;
    const top = topLevelOf(f.file);
    let id = top ? districtIdFor(top) : 'core';
    if (!known.has(id) && id !== 'core') {
      // Top-level folder isn't a known district (file added in this run
      // but cityModel hasn't seen it yet, or unmapped path). Land it under
      // a synthetic 'unmapped' district instead of pretending it belongs
      // to whatever district happens to share the name.
      id = '__unmapped__';
    }
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push({ file: f.file, kind: f.kind });
  }

  const changedDistricts = [];
  for (const [id, files] of buckets.entries()) {
    changedDistricts.push({
      districtId: id,
      districtName: id === '__unmapped__' ? '(unmapped)' : districtName(id),
      files,
    });
  }
  // Stable order: largest first, then by id.
  changedDistricts.sort((a, b) => {
    if (b.files.length !== a.files.length) return b.files.length - a.files.length;
    return a.districtId.localeCompare(b.districtId);
  });
  return changedDistricts;
}

function hasMatch(files, pattern) {
  return (files || []).some((f) => f && typeof f.file === 'string' && pattern.test(f.file));
}

function countByState(checks, state) {
  return (checks || []).filter((c) => c && c.state === state).length;
}

function levelFor(score) {
  if (score >= HIGH_FLOOR) return 'high';
  if (score >= MEDIUM_FLOOR) return 'medium';
  return 'low';
}

/**
 * Compute the risk score, level, and factor list for a run.
 */
function assessRisk({ diffFiles, checks }) {
  let score = LOW_FLOOR;
  const factors = [];
  const fileCount = (diffFiles || []).length;
  const failed = countByState(checks, 'fail');
  const warned = countByState(checks, 'warn');
  const deletes = (diffFiles || []).filter((f) => f && f.kind === 'delete').length;
  const touchesConfig = hasMatch(diffFiles, CONFIG_PATTERN);
  const touchesSecrets = hasMatch(diffFiles, SECRET_PATTERN) || hasMatch(diffFiles, ENV_FILE_PATTERN);

  if (failed > 0) {
    const bump = Math.min(60, 30 * failed);
    score += bump;
    factors.push(`${failed} failed check${failed === 1 ? '' : 's'}`);
  }
  if (warned > 0) {
    const bump = Math.min(30, 10 * warned);
    score += bump;
    factors.push(`${warned} warning check${warned === 1 ? '' : 's'}`);
  }
  if (fileCount > 5) {
    score += 20;
    factors.push(`touches ${fileCount} files`);
  } else if (fileCount > 2) {
    score += 10;
    factors.push(`touches ${fileCount} files`);
  }
  if (deletes > 0) {
    score += Math.min(20, 10 * deletes);
    factors.push(`${deletes} file${deletes === 1 ? '' : 's'} deleted`);
  }
  if (touchesConfig) {
    score += 20;
    factors.push('touches config');
  }
  if (touchesSecrets) {
    score += 30;
    factors.push('touches secrets / env');
  }

  return {
    riskScore: Math.min(100, score),
    riskLevel: levelFor(score),
    riskFactors: factors,
  };
}

function pickNextAction({ run, riskLevel, checks }) {
  const status = run?.status;
  if (status === 'cancelled' || status === 'failed') return 'cancel';
  const failed = countByState(checks, 'fail');
  if (failed > 0) return 'request fixes';
  if (riskLevel === 'high') return 'request fixes';
  const warned = countByState(checks, 'warn');
  if (warned > 0 || riskLevel === 'medium') return 'request changes';
  return 'approve';
}

/**
 * @param {{ run: object, diff?: object, checks?: object[], districts?: object[], intent?: string }} input
 */
export function projectRunReview({ run, diff, checks, districts, intent } = {}) {
  if (!run || typeof run !== 'object') {
    throw new TypeError('projectRunReview: run is required');
  }
  if (typeof run.runId !== 'string' || run.runId.length === 0) {
    throw new TypeError('projectRunReview: run.runId is required');
  }
  const diffFiles = (diff && Array.isArray(diff.files)) ? diff.files : [];
  const checkList = Array.isArray(checks) ? checks : [];
  const changedDistricts = groupChangedFiles(diffFiles, districts);
  const { riskScore, riskLevel, riskFactors } = assessRisk({ diffFiles, checks: checkList });
  const nextAction = pickNextAction({ run, riskLevel, checks: checkList });

  return {
    runId: run.runId,
    intent: typeof intent === 'string' ? intent : null,
    status: run.status || 'unknown',
    changedDistricts,
    checks: checkList,
    riskLevel,
    riskScore,
    riskFactors,
    nextAction,
  };
}

export const _internals = {
  topLevelOf, districtIdFor, groupChangedFiles, assessRisk, pickNextAction,
  CONFIG_PATTERN, SECRET_PATTERN, ENV_FILE_PATTERN,
  MEDIUM_FLOOR, HIGH_FLOOR,
};
