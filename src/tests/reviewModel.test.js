import { describe, expect, it } from 'vitest';
import { groupDiffByDistrict, assessRisk } from '../app/reviewModel.js';

describe('groupDiffByDistrict', () => {
  it('returns [] for empty, missing, or malformed input', () => {
    expect(groupDiffByDistrict([])).toEqual([]);
    expect(groupDiffByDistrict(null)).toEqual([]);
    expect(groupDiffByDistrict(undefined)).toEqual([]);
    expect(groupDiffByDistrict([{ notAFile: true }, null])).toEqual([]);
  });

  it('groups by top-level folder and sends root files to core (city convention)', () => {
    const out = groupDiffByDistrict([
      { file: 'src/App.jsx', kind: 'modify', additions: 2, deletions: 1 },
      { file: 'src/views/RunDetail.jsx', kind: 'modify', additions: 5, deletions: 0 },
      { file: 'README.md', kind: 'modify', additions: 1, deletions: 0 },
    ]);
    expect(out.map((d) => d.district)).toEqual(['src', 'core']);
    expect(out[0].files).toHaveLength(2);
    expect(out[0].additions).toBe(7);
    expect(out[0].deletions).toBe(1);
    expect(out[1].files[0].file).toBe('README.md');
  });

  it('sorts districts by churn, busiest first', () => {
    const out = groupDiffByDistrict([
      { file: 'docs/a.md', kind: 'modify', additions: 1, deletions: 0 },
      { file: 'electron/main.cjs', kind: 'modify', additions: 40, deletions: 12 },
    ]);
    expect(out.map((d) => d.district)).toEqual(['electron', 'docs']);
  });

  it('normalizes Windows separators and collects distinct change kinds', () => {
    const out = groupDiffByDistrict([
      { file: 'src\\game\\hex.js', kind: 'add', additions: 10, deletions: 0 },
      { file: 'src/App.jsx', kind: 'delete', additions: 0, deletions: 30 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].district).toBe('src');
    expect(out[0].kinds.sort()).toEqual(['add', 'delete']);
  });
});

describe('assessRisk', () => {
  it('a small contained change with passing checks is low risk', () => {
    const risk = assessRisk({
      files: [{ file: 'src/a.js', kind: 'modify', additions: 4, deletions: 2 }],
      checks: [{ state: 'pass' }],
    });
    expect(risk.level).toBe('low');
    expect(risk.reasons).toEqual(['small, contained change']);
  });

  it('deleted files and moderate churn escalate to medium with reasons', () => {
    const risk = assessRisk({
      files: [
        { file: 'src/a.js', kind: 'delete', additions: 0, deletions: 100 },
        { file: 'src/b.js', kind: 'modify', additions: 60, deletions: 10 },
      ],
    });
    expect(risk.level).toBe('medium');
    expect(risk.reasons.join(' ')).toMatch(/deleted/);
    expect(risk.reasons.join(' ')).toMatch(/churn/);
  });

  it('failing checks force high risk regardless of diff size', () => {
    const risk = assessRisk({
      files: [{ file: 'src/a.js', kind: 'modify', additions: 1, deletions: 0 }],
      checks: [{ state: 'fail' }],
    });
    expect(risk.level).toBe('high');
    expect(risk.reasons).toContain('checks failing');
  });

  it('a sprawling diff is high risk', () => {
    const files = Array.from({ length: 12 }, (_, i) => ({
      file: `pkg${i}/mod.js`, kind: 'modify', additions: 50, deletions: 20,
    }));
    const risk = assessRisk({ files });
    expect(risk.level).toBe('high');
  });

  it('tolerates missing input entirely', () => {
    expect(assessRisk({}).level).toBe('low');
    expect(assessRisk().level).toBe('low');
  });
});
