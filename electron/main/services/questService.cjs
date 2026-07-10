// questService.cjs — pure quest-board projection (FEAT-025, v4 Phase D).
// Parses the repo's own trackers (features.md open sections + bugs.md open
// section) into quest entries so the Godot workbench's quest board is fed by
// real work items, not fiction. Read-only; injected fs for tests.
const path = require('node:path');

const ENTRY_RE = /^### \[((?:FEAT|BUG)-\d+)\] (.+)$/;

function createQuestService({ fs = require('node:fs/promises') } = {}) {
  async function listQuests(rootPath) {
    if (typeof rootPath !== 'string' || !rootPath) {
      throw new TypeError('listQuests: rootPath must be a non-empty string');
    }
    const [features, bugs] = await Promise.all([
      readTracker(path.join(rootPath, 'features.md')),
      readTracker(path.join(rootPath, 'bugs.md')),
    ]);
    return [...parseTracker(features, 'feature'), ...parseTracker(bugs, 'bug')]
      .filter((q) => q.status === 'open' || q.status === 'in-progress');
  }

  async function readTracker(file) {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      return '';
    }
  }

  return { listQuests };
}

/**
 * Extract quest entries from a tracker document. An entry spans from its
 * `### [ID] title` heading to the next heading; within it we read the
 * priority/severity line, the status line, and the `**Why:**` /
 * `**Observation:**` first sentence as the quest summary.
 */
function parseTracker(text, kind) {
  if (!text) return [];
  const quests = [];
  const lines = text.split('\n');
  let current = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const head = line.match(ENTRY_RE);
    if (head) {
      if (current) quests.push(current);
      current = { id: head[1], title: head[2].trim(), kind, priority: '', status: 'open', summary: '' };
      continue;
    }
    if (!current) continue;
    if (/^## /.test(line)) { quests.push(current); current = null; continue; }
    const pri = line.match(/\*\*(?:Priority|Severity):\*\*\s*(\S+)/);
    if (pri) { current.priority = pri[1]; continue; }
    const status = line.match(/\*\*Status:\*\*\s*(\S+)/);
    if (status) { current.status = status[1]; continue; }
    const why = line.match(/\*\*(?:Why|Observation):\*\*\s*(.+)/);
    if (why && !current.summary) { current.summary = why[1].trim(); continue; }
  }
  if (current) quests.push(current);
  return quests;
}

module.exports = { createQuestService, parseTracker };
