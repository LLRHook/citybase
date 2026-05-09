import { describe, expect, it } from 'vitest';
import { parseFiles } from '../../electron/main/services/gitService.cjs';

// Helper to build the porcelain v2 line shape.
//   1 XY sub mH mI mW hH hI path
const FAKE_TAIL = 'N... 100644 100644 100644 hash1 hash2';
const line1 = (xy, path) => `1 ${xy} ${FAKE_TAIL} ${path}`;
//   2 XY sub mH mI mW hH hI XscoreR path<TAB>orig
const line2 = (xy, path, orig) =>
  `2 ${xy} ${FAKE_TAIL} R100 ${path}\t${orig}`;
// Unmerged porcelain v2:
//   u XY sub m1 m2 m3 mW h1 h2 h3 path  (9 metadata tokens after sub)
const lineU = (path) =>
  `u UU N... 100644 100644 100644 100644 h1 h2 h3 ${path}`;

describe('parseFiles — legacy fields', () => {
  it('returns [] for empty input', () => {
    expect(parseFiles('')).toEqual([]);
  });

  it('preserves the path and the legacy status field', () => {
    const out = parseFiles(line1('.M', 'src/foo.js'));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ path: 'src/foo.js', status: 'modified' });
  });

  it('handles untracked files (?) and renamed (line 2)', () => {
    const stdout = [
      '? new.js',
      line2('R.', 'lib/now-here.js', 'lib/old.js'),
    ].join('\n');
    const out = parseFiles(stdout);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ path: 'new.js', status: 'untracked' });
    expect(out[1]).toMatchObject({ path: 'lib/now-here.js' });
    expect(out[1].status).toBe('renamed');
  });
});

describe('parseFiles — staged / unstaged classification', () => {
  it('classifies M. as staged-only', () => {
    const out = parseFiles(line1('M.', 'src/foo.js'));
    expect(out[0]).toMatchObject({
      staged: true,
      unstaged: false,
      indexStatus: 'modified',
      workTreeStatus: 'unmodified',
    });
  });

  it('classifies .M as unstaged-only', () => {
    const out = parseFiles(line1('.M', 'src/foo.js'));
    expect(out[0]).toMatchObject({
      staged: false,
      unstaged: true,
      indexStatus: 'unmodified',
      workTreeStatus: 'modified',
    });
  });

  it('classifies MM as both staged and unstaged', () => {
    const out = parseFiles(line1('MM', 'src/foo.js'));
    expect(out[0]).toMatchObject({
      staged: true,
      unstaged: true,
      indexStatus: 'modified',
      workTreeStatus: 'modified',
    });
  });

  it('classifies A. as staged add', () => {
    const out = parseFiles(line1('A.', 'src/new.js'));
    expect(out[0]).toMatchObject({
      staged: true,
      unstaged: false,
      indexStatus: 'added',
    });
  });

  it('classifies .D as unstaged delete', () => {
    const out = parseFiles(line1('.D', 'src/gone.js'));
    expect(out[0]).toMatchObject({
      staged: false,
      unstaged: true,
      workTreeStatus: 'deleted',
    });
  });

  it('untracked entries are unstaged-only', () => {
    const out = parseFiles('? new.js');
    expect(out[0]).toMatchObject({
      staged: false,
      unstaged: true,
      indexStatus: 'unmodified',
      workTreeStatus: 'untracked',
    });
  });

  it('unmerged (u) entries are flagged staged AND unstaged with status="conflicted"', () => {
    const out = parseFiles(lineU('lib/conflicted.js'));
    expect(out[0]).toMatchObject({
      path: 'lib/conflicted.js',
      status: 'conflicted',
      staged: true,
      unstaged: true,
      indexStatus: 'conflicted',
      workTreeStatus: 'conflicted',
    });
  });

  it('renamed line (2 R.) carries staging fields too', () => {
    const out = parseFiles(line2('R.', 'lib/now.js', 'lib/old.js'));
    expect(out[0]).toMatchObject({
      path: 'lib/now.js',
      staged: true,
      unstaged: false,
      indexStatus: 'renamed',
      workTreeStatus: 'unmodified',
    });
  });

  it('skips header lines starting with "# "', () => {
    const stdout = [
      '# branch.head main',
      '# branch.ab +0 -0',
      line1('.M', 'src/foo.js'),
    ].join('\n');
    expect(parseFiles(stdout)).toHaveLength(1);
  });
});
