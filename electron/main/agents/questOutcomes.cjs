// Game progression proof. Repository contents stay transient: only bounded
// SHA-256 fingerprints and a changed-file count can become persistent outcomes.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const crypto = require('node:crypto');
const { resolveRepositoryPath } = require('../services/repositoryFiles.cjs');

const MAX_DIFF_BYTES = 512 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_CHANGED_FILES = 64;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const pathsFrom = (value) => (value || '').split('\0').filter(Boolean);

function compareStates(before, after) {
  if (!before?.ok || !after?.ok) return 0;
  const oldFiles = new Map(before.files);
  const newFiles = new Map(after.files);
  return [...new Set([...oldFiles.keys(), ...newFiles.keys()])]
    .filter((name) => oldFiles.get(name) !== newFiles.get(name)).length;
}

function createQuestOutcomes({ run }) {
  async function capture(cwd, before) {
    try {
      const options = { cwd, timeoutMs: 2000, maxBuffer: MAX_DIFF_BYTES };
      let base = before?.base;
      if (!base) {
        const head = await run('git', ['rev-parse', '--verify', 'HEAD'], options);
        if (head.ok) base = head.stdout.trim();
        else {
          const empty = await run('git', ['hash-object', '-t', 'tree', '--stdin'], { ...options, stdin: '' });
          if (!empty.ok) return { ok: false, reason: 'repository-unavailable' };
          base = empty.stdout.trim();
        }
      }
      if (!/^[a-f0-9]{40,64}$/.test(base)) return { ok: false, reason: 'repository-unavailable' };
      // A fixed base makes committing/staging existing work alone ineligible.
      // All commands are reads; disable optional index refresh locks and helpers.
      const prefix = ['--no-optional-locks', '--literal-pathspecs'];
      const [diff, changed, untracked] = await Promise.all([
        run('git', [...prefix, 'diff', '--no-ext-diff', '--no-textconv', '--no-color', '--binary', base, '--'], options),
        run('git', [...prefix, 'diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z', base, '--'], { ...options, maxBuffer: 32 * 1024 }),
        run('git', [...prefix, 'ls-files', '--others', '--exclude-standard', '-z'], { ...options, maxBuffer: 32 * 1024 }),
      ]);
      if (![diff, changed, untracked].every((result) => result.ok)) return { ok: false, reason: 'inspection-unavailable' };
      const names = [...new Set([...pathsFrom(changed.stdout), ...pathsFrom(untracked.stdout), ...(before?.files || []).map(([name]) => name)])].sort();
      if (names.length > MAX_CHANGED_FILES) return { ok: false, reason: 'inspection-limit' };
      const files = [];
      let totalBytes = 0;
      for (const name of names) {
        let handle;
        try {
          const resolved = await resolveRepositoryPath({ rootPath: cwd }, name);
          handle = await fs.open(resolved.target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
          const stat = await handle.stat();
          if (!stat.isFile() || stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_TOTAL_BYTES) {
            return { ok: false, reason: 'inspection-limit' };
          }
          const bytes = Buffer.alloc(Math.min(MAX_FILE_BYTES + 1, stat.size + 1));
          const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
          if (bytesRead > MAX_FILE_BYTES || bytesRead !== stat.size) return { ok: false, reason: 'state-changing' };
          const afterStat = await handle.stat();
          if (afterStat.size !== stat.size || afterStat.mtimeMs !== stat.mtimeMs) return { ok: false, reason: 'state-changing' };
          totalBytes += bytesRead;
          files.push([name, hash(Buffer.concat([Buffer.from(`${stat.mode & 0o777}\0`), bytes.subarray(0, bytesRead)]))]);
        } catch (err) {
          if (err.code === 'ENOENT') files.push([name, 'deleted']);
          else return { ok: false, reason: 'inspection-unavailable' };
        } finally { if (handle) await handle.close(); }
      }
      return { ok: true, base, files, hash: hash(`${diff.stdout}\0${JSON.stringify(files)}`) };
    } catch { return { ok: false, reason: 'inspection-unavailable' }; }
  }

  async function verify({ questSkill, readOnly, successful, hasAssistantOutput, cwd, before }) {
    const kind = questSkill === 'survey' ? 'scout' : ['craft', 'repair'].includes(questSkill) ? 'build' : null;
    const no = (reason) => ({ kind, verified: false, filesChanged: 0, reason });
    if (!kind) return no('quest-type-unset');
    if (!successful) return no('run-not-successful');
    if (kind === 'scout') return hasAssistantOutput
      ? { kind, verified: true, filesChanged: 0, evidence: 'assistant-output' }
      : no('no-assistant-output');
    if (readOnly) return no('read-only-quest');
    if (!before?.ok) return no(before?.reason || 'inspection-unavailable');
    const after = await capture(cwd, before);
    if (!after.ok) return no(after.reason);
    const filesChanged = compareStates(before, after);
    if (!filesChanged || before.hash === after.hash) return no('no-repository-change');
    return { kind, verified: true, filesChanged, evidence: 'repository-fingerprint', before: before.hash, after: after.hash };
  }

  return { capture, verify };
}

module.exports = { createQuestOutcomes, compareStates, MAX_CHANGED_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES };
