import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../../electron/main/agents/parseUnifiedDiff.cjs';

describe('parseUnifiedDiff', () => {
  it('returns no files for empty/non-string input', () => {
    expect(parseUnifiedDiff('')).toEqual({ files: [] });
    expect(parseUnifiedDiff(null)).toEqual({ files: [] });
    expect(parseUnifiedDiff(undefined)).toEqual({ files: [] });
  });

  it('parses a single modify hunk with adds, deletes, and context', () => {
    const stdout = [
      'diff --git a/src/lib/foo.js b/src/lib/foo.js',
      'index abc..def 100644',
      '--- a/src/lib/foo.js',
      '+++ b/src/lib/foo.js',
      '@@ -10,3 +10,4 @@',
      ' const a = 1',
      '-const b = 2',
      '+const b = 22',
      '+const c = 3',
      ' const d = 4',
    ].join('\n');
    const { files } = parseUnifiedDiff(stdout);
    expect(files).toHaveLength(1);
    const f = files[0];
    expect(f.file).toBe('src/lib/foo.js');
    expect(f.kind).toBe('modify');
    expect(f.additions).toBe(2);
    expect(f.deletions).toBe(1);
    expect(f.hunks).toEqual([
      { line: 10, type: 'ctx', code: 'const a = 1' },
      { line: 11, type: 'del', code: 'const b = 2' },
      { line: 11, type: 'add', code: 'const b = 22' },
      { line: 12, type: 'add', code: 'const c = 3' },
      { line: 13, type: 'ctx', code: 'const d = 4' },
    ]);
  });

  it('classifies a new file as kind="add"', () => {
    const stdout = [
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1,2 @@',
      '+hello',
      '+world',
    ].join('\n');
    const { files } = parseUnifiedDiff(stdout);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      file: 'new.txt',
      kind: 'add',
      additions: 2,
      deletions: 0,
    });
    expect(files[0].hunks.map(h => h.type)).toEqual(['add', 'add']);
  });

  it('classifies a removed file as kind="delete"', () => {
    const stdout = [
      'diff --git a/gone.txt b/gone.txt',
      'deleted file mode 100644',
      '--- a/gone.txt',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-bye',
      '-cruel world',
    ].join('\n');
    const { files } = parseUnifiedDiff(stdout);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      file: 'gone.txt',
      kind: 'delete',
      additions: 0,
      deletions: 2,
    });
  });

  it('handles multiple file blocks in one diff', () => {
    const stdout = [
      'diff --git a/a.js b/a.js',
      '--- a/a.js',
      '+++ b/a.js',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      'diff --git a/b.js b/b.js',
      '--- a/b.js',
      '+++ b/b.js',
      '@@ -2,1 +2,1 @@',
      '-x',
      '+y',
    ].join('\n');
    const { files } = parseUnifiedDiff(stdout);
    expect(files.map(f => f.file)).toEqual(['a.js', 'b.js']);
    expect(files[0].hunks).toEqual([
      { line: 1, type: 'del', code: 'old' },
      { line: 1, type: 'add', code: 'new' },
    ]);
    expect(files[1].hunks[0].line).toBe(2);
  });

  it('parses multiple hunks within a single file', () => {
    const stdout = [
      'diff --git a/c.js b/c.js',
      '--- a/c.js',
      '+++ b/c.js',
      '@@ -1,1 +1,1 @@',
      '-foo',
      '+FOO',
      '@@ -50,1 +50,1 @@',
      '-bar',
      '+BAR',
    ].join('\n');
    const { files } = parseUnifiedDiff(stdout);
    expect(files[0].hunks).toEqual([
      { line: 1, type: 'del', code: 'foo' },
      { line: 1, type: 'add', code: 'FOO' },
      { line: 50, type: 'del', code: 'bar' },
      { line: 50, type: 'add', code: 'BAR' },
    ]);
    expect(files[0].additions).toBe(2);
    expect(files[0].deletions).toBe(2);
  });

  it('strips trailing CR from Windows-style line endings', () => {
    const stdout = [
      'diff --git a/win.txt b/win.txt\r',
      '--- a/win.txt\r',
      '+++ b/win.txt\r',
      '@@ -1,1 +1,1 @@\r',
      '-old\r',
      '+new\r',
    ].join('\n');
    const { files } = parseUnifiedDiff(stdout);
    expect(files[0].file).toBe('win.txt');
    expect(files[0].hunks).toEqual([
      { line: 1, type: 'del', code: 'old' },
      { line: 1, type: 'add', code: 'new' },
    ]);
  });

  it('ignores the "\\ No newline at end of file" marker', () => {
    const stdout = [
      'diff --git a/foo b/foo',
      '--- a/foo',
      '+++ b/foo',
      '@@ -1,1 +1,1 @@',
      '-old',
      '\\ No newline at end of file',
      '+new',
      '\\ No newline at end of file',
    ].join('\n');
    const { files } = parseUnifiedDiff(stdout);
    expect(files[0].hunks.map(h => h.type)).toEqual(['del', 'add']);
  });

  it('survives a file path containing spaces', () => {
    const stdout = [
      'diff --git a/dir name/space file.js b/dir name/space file.js',
      '--- a/dir name/space file.js',
      '+++ b/dir name/space file.js',
      '@@ -1,1 +1,1 @@',
      '-x',
      '+y',
    ].join('\n');
    const { files } = parseUnifiedDiff(stdout);
    expect(files[0].file).toBe('dir name/space file.js');
  });

  it('skips hunk-body lines that arrive before any @@ header', () => {
    const stdout = [
      'diff --git a/x b/x',
      '--- a/x',
      '+++ b/x',
      '+stray plus before @@',
      '@@ -1,1 +1,1 @@',
      '-real',
      '+actual',
    ].join('\n');
    const { files } = parseUnifiedDiff(stdout);
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(1);
    expect(files[0].hunks).toHaveLength(2);
  });
});
