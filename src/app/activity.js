// activity.js — pure projection from a Git snapshot to the ActivityFeed
// item shape: { t, kind, text }.
//
// What counts as "activity" in v0.1:
//   - recent commits (kind='quest' so the cyan ◆ glyph reads as a delivered
//     unit of work, matching the visual rhythm the seed established)
//   - working-tree changes since HEAD (kind='good' for additions, 'bad' for
//     deletions/conflicts, neutral 'quest' otherwise)
//
// Both streams are merged and capped. Commits sort newest-first by their
// ISO timestamp; working-tree entries are appended underneath because they
// represent uncommitted state, not history.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_LIMIT = 8;

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Compact timestamp the ActivityFeed already styles in a 32px column:
//   <60m  → "12m"
//   <24h  → "5h"
//   else  → "HH:MM" (commit date local-time clock)
export function formatCommitTime(iso, now) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const ago = (now ?? Date.now()) - d.getTime();
  if (ago < HOUR_MS) {
    return `${Math.max(0, Math.floor(ago / 60000))}m`;
  }
  if (ago < DAY_MS) {
    return `${Math.floor(ago / HOUR_MS)}h`;
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function commitsToItems(recentCommits, now) {
  if (!Array.isArray(recentCommits)) return [];
  return recentCommits
    .map((c) => {
      const title = (c?.title || '').trim();
      const hash = c?.hash || '';
      if (!title && !hash) return null;
      const text = hash
        ? `${title || '(no subject)'} · ${hash}`
        : title;
      return {
        t: formatCommitTime(c?.committedAt, now),
        kind: 'quest',
        text,
      };
    })
    .filter(Boolean);
}

function basenameOf(p) {
  if (typeof p !== 'string' || p.length === 0) return '';
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

const STATUS_KIND = {
  added: 'good',
  modified: 'quest',
  renamed: 'quest',
  deleted: 'bad',
  conflicted: 'bad',
  untracked: 'good',
  unmodified: 'quest',
};

function dirtyToItems(files) {
  if (!Array.isArray(files)) return [];
  return files.map((f) => {
    const path = f?.path || '';
    const status = f?.status || 'modified';
    const name = basenameOf(path);
    return {
      t: 'now',
      kind: STATUS_KIND[status] || 'quest',
      text: `${status} · ${name}`,
    };
  });
}

/**
 * Project a workspace Git snapshot into ActivityFeed items.
 * Returns a stable ordering: working-tree changes first (top of feed = most
 * immediately actionable), then commits newest-first.
 *
 * @param {object|null|undefined} snapshot — shape from gitService.getSnapshot
 * @param {{ now?: number, limit?: number }} [opts]
 * @returns {Array<{ t: string, kind: string, text: string }>}
 */
export function projectSnapshotToActivity(snapshot, opts = {}) {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;
  const dirtyItems = dirtyToItems(snapshot.files);
  const commitItems = commitsToItems(snapshot.recentCommits, opts.now);
  return [...dirtyItems, ...commitItems].slice(0, limit);
}
