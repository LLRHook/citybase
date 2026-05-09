// parseUnifiedDiff — turn `git diff --unified=N --no-color` stdout into
// the DiffFile[] shape the AgentProvider contract defines (see
// docs/agent-runtime.md and AgentAdapter.cjs).
//
// Pure: no I/O, no globals, just text in -> structured array out. The
// adapter (CodexAdapter / ClaudeAdapter) is responsible for actually
// running git diff inside the run's sandbox.
//
// Format reference:
//   https://www.gnu.org/software/diffutils/manual/html_node/Detailed-Unified.html
//   https://git-scm.com/docs/diff-format#_combined_diff_format
//
// Output line numbers:
//   - 'add' rows carry the new-file line number
//   - 'del' rows carry the old-file line number
//   - 'ctx' rows carry the new-file line number (matches the way
//     analysis.jsx already renders them today)

function startsWith(line, prefix) {
  return line.length >= prefix.length && line.slice(0, prefix.length) === prefix;
}

// Parse "@@ -OLD_START,OLD_COUNT +NEW_START,NEW_COUNT @@ optional context"
function parseHunkHeader(line) {
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  if (!m) return null;
  return { oldStart: Number(m[1]), newStart: Number(m[2]) };
}

// "diff --git a/path b/path" — path may contain spaces; per Git docs the
// 'b/' side is the post-image path. Use it as the file identifier.
function parseDiffHeader(line) {
  const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  if (!m) return null;
  return { aPath: m[1], bPath: m[2] };
}

function classifyKind({ oldFile, newFile }) {
  if (oldFile === '/dev/null' && newFile && newFile !== '/dev/null') return 'add';
  if (newFile === '/dev/null' && oldFile && oldFile !== '/dev/null') return 'delete';
  return 'modify';
}

/**
 * @param {string} stdout — raw `git diff --unified=N --no-color` output
 * @returns {{ files: import('./AgentAdapter.cjs').DiffFile[] }}
 */
function parseUnifiedDiff(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) return { files: [] };

  const lines = stdout.split('\n');
  const files = [];
  let current = null; // partial DiffFile being built
  let oldFile = null;
  let newFile = null;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  function pushCurrent() {
    if (!current) return;
    current.kind = classifyKind({ oldFile, newFile });
    files.push(current);
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');

    // New file block — push the previous one and start fresh.
    const head = parseDiffHeader(line);
    if (head) {
      pushCurrent();
      current = {
        file: head.bPath !== '/dev/null' ? head.bPath : head.aPath,
        kind: 'modify',
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      oldFile = null;
      newFile = null;
      inHunk = false;
      continue;
    }

    if (!current) continue; // header preamble before any file block — skip

    if (startsWith(line, '--- ')) {
      const tail = line.slice(4).trim();
      oldFile = tail === '/dev/null' ? '/dev/null' : tail.replace(/^a\//, '');
      inHunk = false;
      continue;
    }
    if (startsWith(line, '+++ ')) {
      const tail = line.slice(4).trim();
      newFile = tail === '/dev/null' ? '/dev/null' : tail.replace(/^b\//, '');
      // Prefer the new-file path as the identifier for added/modified
      // files; for deletes, fall back to the old path.
      if (newFile && newFile !== '/dev/null') current.file = newFile;
      else if (oldFile && oldFile !== '/dev/null') current.file = oldFile;
      inHunk = false;
      continue;
    }

    const hunk = parseHunkHeader(line);
    if (hunk) {
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    // Hunk body. Skip the rare "\ No newline at end of file" marker.
    if (line.startsWith('\\')) continue;

    if (line.startsWith('+')) {
      current.hunks.push({ line: newLine, type: 'add', code: line.slice(1) });
      current.additions += 1;
      newLine += 1;
    } else if (line.startsWith('-')) {
      current.hunks.push({ line: oldLine, type: 'del', code: line.slice(1) });
      current.deletions += 1;
      oldLine += 1;
    } else if (line.startsWith(' ')) {
      current.hunks.push({ line: newLine, type: 'ctx', code: line.slice(1) });
      oldLine += 1;
      newLine += 1;
    }
    // Anything else (blank line outside a hunk, junk) is ignored.
  }

  pushCurrent();
  return { files };
}

module.exports = { parseUnifiedDiff };
