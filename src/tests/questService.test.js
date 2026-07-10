// questService — the repo's trackers projected as quest-board entries
// (FEAT-025). Parser + service against injected fs.
import { describe, expect, it, vi } from 'vitest';
import { createQuestService, parseTracker } from '../../electron/main/services/questService.cjs';

const FEATURES = `# Tracker

## Open

### [FEAT-101] Build the thing
- [ ] **Priority:** high
- **Area:** godot
- **Why:** the thing is missing. More detail here.
- **Status:** open

### [FEAT-102] Old shipped thing
- [x] **Priority:** med
- **Why:** already done.
- **Status:** shipped-pending-migration

## Shipped

### [FEAT-100] Ancient thing
- **Status:** migrated
`;

const BUGS = `## Open

### [BUG-201] Broken widget
- [ ] **Severity:** crit
- **Observation:** it explodes on click.
- **Status:** in-progress
`;

describe('parseTracker', () => {
  it('extracts id, title, priority, status, and summary', () => {
    const out = parseTracker(FEATURES, 'feature');
    expect(out.find((q) => q.id === 'FEAT-101')).toEqual({
      id: 'FEAT-101', title: 'Build the thing', kind: 'feature',
      priority: 'high', status: 'open', summary: 'the thing is missing. More detail here.',
    });
  });

  it('reads Severity as priority for bug entries', () => {
    const out = parseTracker(BUGS, 'bug');
    expect(out[0]).toMatchObject({ id: 'BUG-201', priority: 'crit', status: 'in-progress' });
    expect(out[0].summary).toMatch(/explodes/);
  });

  it('returns [] for empty input', () => {
    expect(parseTracker('', 'bug')).toEqual([]);
  });
});

describe('createQuestService.listQuests', () => {
  const fakeFs = {
    readFile: vi.fn(async (p) => {
      if (p.endsWith('features.md')) return FEATURES;
      if (p.endsWith('bugs.md')) return BUGS;
      const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
    }),
  };

  it('merges both trackers and keeps only open/in-progress entries', async () => {
    const svc = createQuestService({ fs: fakeFs });
    const quests = await svc.listQuests('/repo');
    expect(quests.map((q) => q.id)).toEqual(['FEAT-101', 'BUG-201']);
  });

  it('tolerates missing tracker files', async () => {
    const svc = createQuestService({
      fs: { readFile: vi.fn(async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }) },
    });
    expect(await svc.listQuests('/repo')).toEqual([]);
  });

  it('rejects a missing rootPath', async () => {
    const svc = createQuestService({ fs: fakeFs });
    await expect(svc.listQuests('')).rejects.toThrow(TypeError);
  });
});
