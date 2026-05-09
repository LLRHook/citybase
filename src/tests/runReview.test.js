import { describe, expect, it } from 'vitest';
import { projectRunReview, _internals } from '../app/runReview.js';

const RUN = {
  runId: 'run-1',
  questId: 'TASK-1',
  adventurerId: 'alpha-7',
  status: 'done',
  contextUsed: 0,
  maxContext: 200_000,
  branch: 'feat/foo',
};

const DISTRICTS = [
  { id: 'src', name: 'src' },
  { id: 'docs', name: 'docs' },
  { id: 'lib', name: 'lib' },
  { id: 'core', name: '/' },
];

function diffFile({ file, kind = 'modify' }) {
  return { file, kind, additions: 1, deletions: 0, hunks: [] };
}

function check({ name, state, meta = '' }) {
  return { name, state, meta };
}

describe('projectRunReview — input validation', () => {
  it('throws when run is missing', () => {
    expect(() => projectRunReview({})).toThrow(/run is required/);
    expect(() => projectRunReview({ run: null })).toThrow(/run is required/);
  });

  it('throws when run.runId is missing or empty', () => {
    expect(() => projectRunReview({ run: { runId: '' } })).toThrow(/run\.runId is required/);
    expect(() => projectRunReview({ run: { runId: undefined } })).toThrow(/run\.runId is required/);
  });

  it('tolerates missing diff / checks / districts (returns the empty-result shape)', () => {
    const out = projectRunReview({ run: RUN });
    expect(out).toMatchObject({
      runId: 'run-1',
      status: 'done',
      changedDistricts: [],
      checks: [],
      riskLevel: 'low',
      riskScore: 0,
      riskFactors: [],
      nextAction: 'approve',
    });
  });

  it('echoes the intent string when provided, falls back to null', () => {
    const withIntent = projectRunReview({ run: RUN, intent: 'refactor github.ts' });
    expect(withIntent.intent).toBe('refactor github.ts');
    const without = projectRunReview({ run: RUN });
    expect(without.intent).toBeNull();
  });
});

describe('projectRunReview — district mapping', () => {
  it('groups changed files by their top-level folder into known districts', () => {
    const diff = { files: [
      diffFile({ file: 'src/foo.js' }),
      diffFile({ file: 'src/bar.js' }),
      diffFile({ file: 'docs/README.md' }),
    ]};
    const out = projectRunReview({ run: RUN, diff, districts: DISTRICTS });
    const ids = out.changedDistricts.map((d) => d.districtId);
    expect(ids).toContain('src');
    expect(ids).toContain('docs');
    const src = out.changedDistricts.find((d) => d.districtId === 'src');
    expect(src.files).toHaveLength(2);
    expect(src.districtName).toBe('src');
  });

  it("lands root-level files under the 'core' district", () => {
    const diff = { files: [diffFile({ file: 'package.json' })]};
    const out = projectRunReview({ run: RUN, diff, districts: DISTRICTS });
    expect(out.changedDistricts[0].districtId).toBe('core');
  });

  it("lands files in unknown top-level folders under '__unmapped__' instead of fabricating a district", () => {
    const diff = { files: [diffFile({ file: 'never-heard-of/x.js' })]};
    const out = projectRunReview({ run: RUN, diff, districts: DISTRICTS });
    expect(out.changedDistricts[0].districtId).toBe('__unmapped__');
    expect(out.changedDistricts[0].districtName).toBe('(unmapped)');
  });

  it('orders changedDistricts by file count descending then by id', () => {
    const diff = { files: [
      diffFile({ file: 'docs/a.md' }),
      diffFile({ file: 'src/a.js' }),
      diffFile({ file: 'src/b.js' }),
      diffFile({ file: 'src/c.js' }),
      diffFile({ file: 'lib/a.js' }),
    ]};
    const out = projectRunReview({ run: RUN, diff, districts: DISTRICTS });
    const ids = out.changedDistricts.map((d) => d.districtId);
    expect(ids[0]).toBe('src');
    // 'docs' and 'lib' both have 1 file → tie broken alphabetically
    expect(ids.slice(1)).toEqual(['docs', 'lib']);
  });
});

describe('projectRunReview — risk model', () => {
  it('all-pass with one tiny change → low risk', () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [diffFile({ file: 'src/foo.js' })]},
      checks: [check({ name: 'lint', state: 'pass' })],
      districts: DISTRICTS,
    });
    expect(out.riskLevel).toBe('low');
    expect(out.riskScore).toBe(0);
    expect(out.riskFactors).toEqual([]);
  });

  it('a single failed check pushes risk to medium / high band', () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [diffFile({ file: 'src/foo.js' })]},
      checks: [check({ name: 'test', state: 'fail', meta: 'exit 1' })],
      districts: DISTRICTS,
    });
    expect(out.riskScore).toBeGreaterThanOrEqual(_internals.MEDIUM_FLOOR);
    expect(out.riskFactors.some((f) => /failed check/.test(f))).toBe(true);
  });

  it('warn checks contribute, but cannot push score past medium on their own', () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [diffFile({ file: 'src/foo.js' })]},
      checks: [check({ name: 'lint', state: 'warn' })],
      districts: DISTRICTS,
    });
    expect(out.riskFactors.some((f) => /warning check/.test(f))).toBe(true);
    expect(out.riskScore).toBeLessThan(_internals.HIGH_FLOOR);
  });

  it('a large file count adds risk and surfaces a factor', () => {
    const files = Array.from({ length: 7 }, (_, i) => diffFile({ file: `src/f${i}.js` }));
    const out = projectRunReview({
      run: RUN,
      diff: { files },
      districts: DISTRICTS,
    });
    expect(out.riskFactors.some((f) => /touches 7 files/.test(f))).toBe(true);
  });

  it('touching package.json is flagged as a config edit', () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [diffFile({ file: 'package.json' })]},
      districts: DISTRICTS,
    });
    expect(out.riskFactors).toContain('touches config');
  });

  it('touching a .env file is flagged as a secrets edit and bumps risk', () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [diffFile({ file: '.env.production' })]},
      districts: DISTRICTS,
    });
    expect(out.riskFactors.some((f) => /secrets|env/.test(f))).toBe(true);
    expect(out.riskScore).toBeGreaterThan(0);
  });

  it('a delete adds risk and surfaces a "deleted" factor', () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [diffFile({ file: 'lib/deprecated.js', kind: 'delete' })]},
      districts: DISTRICTS,
    });
    expect(out.riskFactors.some((f) => /deleted/.test(f))).toBe(true);
  });

  it('riskScore is capped at 100 even with multiple compounding factors', () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [
        diffFile({ file: 'package.json' }),
        diffFile({ file: '.env' }),
        ...Array.from({ length: 8 }, (_, i) => diffFile({ file: `src/x${i}.js`, kind: 'delete' })),
      ]},
      checks: [
        check({ name: 'lint', state: 'fail' }),
        check({ name: 'test', state: 'fail' }),
        check({ name: 'typecheck', state: 'warn' }),
      ],
      districts: DISTRICTS,
    });
    expect(out.riskScore).toBeLessThanOrEqual(100);
    expect(out.riskLevel).toBe('high');
  });
});

describe('projectRunReview — nextAction', () => {
  it("returns 'cancel' when the run failed or was cancelled", () => {
    const failed = projectRunReview({ run: { ...RUN, status: 'failed' } });
    expect(failed.nextAction).toBe('cancel');
    const cancelled = projectRunReview({ run: { ...RUN, status: 'cancelled' } });
    expect(cancelled.nextAction).toBe('cancel');
  });

  it("returns 'request fixes' when there is at least one failed check", () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [diffFile({ file: 'src/a.js' })]},
      checks: [check({ name: 'test', state: 'fail' })],
      districts: DISTRICTS,
    });
    expect(out.nextAction).toBe('request fixes');
  });

  it("returns 'request fixes' when risk is high even if no checks failed", () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [
        diffFile({ file: '.env' }),
        diffFile({ file: 'package.json' }),
        ...Array.from({ length: 6 }, (_, i) => diffFile({ file: `src/x${i}.js`, kind: 'delete' })),
      ]},
      districts: DISTRICTS,
    });
    expect(out.riskLevel).toBe('high');
    expect(out.nextAction).toBe('request fixes');
  });

  it("returns 'request changes' for warn checks or medium risk", () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [diffFile({ file: 'src/a.js' })]},
      checks: [check({ name: 'lint', state: 'warn' })],
      districts: DISTRICTS,
    });
    expect(out.nextAction).toBe('request changes');
  });

  it("returns 'approve' when everything is clean and risk is low", () => {
    const out = projectRunReview({
      run: RUN,
      diff: { files: [diffFile({ file: 'src/a.js' })]},
      checks: [check({ name: 'lint', state: 'pass' }), check({ name: 'test', state: 'pass' })],
      districts: DISTRICTS,
    });
    expect(out.nextAction).toBe('approve');
  });
});

describe('projectRunReview — output shape stability', () => {
  it('returns a frozen-ish keyset every consumer can rely on', () => {
    const out = projectRunReview({ run: RUN });
    expect(Object.keys(out).sort()).toEqual([
      'changedDistricts', 'checks', 'intent', 'nextAction',
      'riskFactors', 'riskLevel', 'riskScore', 'runId', 'status',
    ]);
  });

  it('passes through the checks array unchanged so the UI can render meta strings', () => {
    const checks = [
      check({ name: 'lint · npm run lint', state: 'pass', meta: 'clean in 80ms' }),
      check({ name: 'test · npm run test', state: 'fail', meta: 'exited 1' }),
    ];
    const out = projectRunReview({ run: RUN, checks, districts: DISTRICTS });
    expect(out.checks).toEqual(checks);
  });
});
