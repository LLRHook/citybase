import { describe, expect, it } from 'vitest';
import { parseBranchList } from '../../electron/main/services/gitService.cjs';

describe('parseBranchList', () => {
  it('returns an empty list for empty / non-string input', () => {
    expect(parseBranchList('')).toEqual([]);
    expect(parseBranchList(null)).toEqual([]);
    expect(parseBranchList(undefined)).toEqual([]);
  });

  it('parses a single non-current branch with no upstream', () => {
    expect(parseBranchList('feature/x\t\t')).toEqual([
      { name: 'feature/x', isCurrent: false, upstream: null },
    ]);
  });

  it('marks the current branch via the * head sigil', () => {
    const stdout = [
      'main\t*\torigin/main',
      'feature/x\t\t',
    ].join('\n');
    expect(parseBranchList(stdout)).toEqual([
      { name: 'main', isCurrent: true, upstream: 'origin/main' },
      { name: 'feature/x', isCurrent: false, upstream: null },
    ]);
  });

  it('captures upstream tracking refs when present', () => {
    expect(parseBranchList('fix/y\t\torigin/fix/y')).toEqual([
      { name: 'fix/y', isCurrent: false, upstream: 'origin/fix/y' },
    ]);
  });

  it('strips trailing CR for Windows-style line endings', () => {
    const stdout = 'main\t*\torigin/main\r\nfeature/x\t\t\r\n';
    expect(parseBranchList(stdout)).toEqual([
      { name: 'main', isCurrent: true, upstream: 'origin/main' },
      { name: 'feature/x', isCurrent: false, upstream: null },
    ]);
  });

  it('skips blank lines and lines with no name', () => {
    const stdout = [
      'main\t*\torigin/main',
      '',
      '\t\t',
      'feature/x\t\t',
    ].join('\n');
    expect(parseBranchList(stdout).map(b => b.name)).toEqual(['main', 'feature/x']);
  });

  it('tolerates branches whose name itself contains internal whitespace markers', () => {
    // git branch refnames can contain '/' and other characters; the parser
    // splits only on TAB so '/' inside a name is preserved.
    const stdout = 'release/2024.10\t\torigin/release/2024.10';
    expect(parseBranchList(stdout)).toEqual([
      { name: 'release/2024.10', isCurrent: false, upstream: 'origin/release/2024.10' },
    ]);
  });

  it('returns a plain array — never undefined entries', () => {
    const out = parseBranchList('main\t*\torigin/main\nfeature/x\t\t');
    expect(Array.isArray(out)).toBe(true);
    expect(out.every(Boolean)).toBe(true);
  });
});
