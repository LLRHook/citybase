// Single mock data source. The backend (Phase 1+) replaces this file with
// live projections; add new mock data here, not in component files.
//
// Domain mapping: folders → districts, files → buildings, contributors →
// guilds, coding agents → adventurers, tickets → quests.

// =================== REPO ===================

export const REPO = {
  name: 'my-website',
  remote: 'bitbucket.org/llrhook/my-website',
  branch: 'main',
  commit: 'a4a9f82',
};

// =================== DISTRICTS ===================

export const DISTRICTS = [
  { id: 'components-ui',   name: 'components/ui',   color: 'cyan',    q: -3, r: -2, files: 9, health: 94, label: 'Frontline Foundry', sub: 'reusable UI' },
  { id: 'components-work', name: 'components/work', color: 'magenta', q:  1, r: -3, files: 7, health: 81, label: 'Work District',     sub: 'timeline' },
  { id: 'lib',             name: 'lib',             color: 'amber',   q:  4, r: -2, files: 4, health: 88, label: 'Lib Vault',         sub: 'helpers' },
  { id: 'components',      name: 'components',      color: 'green',   q: -3, r:  1, files: 7, health: 92, label: 'Component Quarter', sub: 'sections' },
  { id: 'core',            name: '/',               color: 'white',   q:  0, r:  0, files: 5, health: 92, label: 'Codebase Core',     sub: 'layout · page · root' },
  { id: 'api',             name: 'api',             color: 'cyan',    q:  4, r:  1, files: 2, health: 76, label: 'API Spire',         sub: 'readme · repos' },
  { id: 'e2e',             name: 'e2e',             color: 'magenta', q: -2, r:  3, files: 3, health: 70, label: 'Proving Grounds',   sub: 'playwright' },
  { id: 'ci',              name: '.github',         color: 'amber',   q:  3, r:  3, files: 4, health: 88, label: 'CI Bastion',        sub: 'workflows' },
];

// =================== BUILDINGS ===================

export const BUILDINGS = [
  { d: 'components-ui', name: 'AuroraBackground.tsx', type: 'tower' },
  { d: 'components-ui', name: 'NoiseOverlay.tsx',     type: 'house' },
  { d: 'components-ui', name: 'ParticlesBackground.tsx', type: 'tower' },
  { d: 'components-ui', name: 'GlassCard.tsx',        type: 'house' },
  { d: 'components-ui', name: 'Container.tsx',        type: 'house' },
  { d: 'components-work', name: 'TimelineSection.tsx',  type: 'tower' },
  { d: 'components-work', name: 'TimelineCard.tsx',     type: 'house' },
  { d: 'components-work', name: 'ProjectCardExpanded.tsx', type: 'house' },
  { d: 'components-work', name: 'LanguageBar.tsx',      type: 'house' },
  { d: 'lib', name: 'github.ts',     type: 'tower' },
  { d: 'lib', name: 'constants.ts',  type: 'house' },
  { d: 'lib', name: 'types.ts',      type: 'house' },
  { d: 'core', name: 'layout.tsx',   type: 'tower' },
  { d: 'core', name: 'page.tsx',     type: 'tower' },
  { d: 'core', name: 'globals.css',  type: 'house' },
  { d: 'components', name: 'HeroSection.tsx',   type: 'tower' },
  { d: 'components', name: 'AboutSection.tsx',  type: 'house' },
  { d: 'components', name: 'ContactSection.tsx', type: 'house' },
  { d: 'components', name: 'Navbar.tsx',        type: 'tower' },
  { d: 'api', name: 'readme/route.ts', type: 'tower' },
  { d: 'api', name: 'repos/route.ts',  type: 'house' },
  { d: 'e2e', name: 'timeline.spec.ts', type: 'house' },
  { d: 'e2e', name: 'home.spec.ts',     type: 'house' },
  { d: 'ci', name: 'deploy.yml', type: 'house' },
  { d: 'ci', name: 'test.yml',   type: 'house' },
];

// =================== GUILDS & ADVENTURERS ===================
// HP MODEL: HP represents remaining context capacity.
//   HP% = (1 - contextUsed / maxContext) * 100

export const GUILDS = [
  {
    id: 'victor', name: 'House Ivanov', author: 'Victor Ivanov', handle: '@LLRHook',
    level: 12, xp: 7820, xpNext: 9000, role: 'admin', commits: 142, crest: 'V', color: 'magenta',
    adventurers: [
      { id: 'alpha-7',  name: 'Alpha-7',  class: 'Refactorer', level: 6, xp: 540, xpNext: 800, mp: 62, status: 'active',  skills: ['refactor','bugfix','tests'], maxContext: 200000, contextUsed: 31200 },
      { id: 'bravo-2',  name: 'Bravo-2',  class: 'Test Smith', level: 4, xp: 220, xpNext: 400, mp: 100, status: 'idle',    skills: ['tests','lint'],              maxContext: 128000, contextUsed: 0 },
      { id: 'gamma-9',  name: 'Gamma-9',  class: 'Doc Scribe', level: 2, xp: 90,  xpNext: 200, mp: 80,  status: 'idle',    skills: ['docs','review'],             maxContext: 128000, contextUsed: 0 },
    ],
  },
  {
    id: 'maya', name: 'Order of Lin', author: 'Maya Lin', handle: '@mlin',
    level: 8, xp: 4210, xpNext: 5500, role: 'member', commits: 86, crest: 'M', color: 'cyan',
    adventurers: [
      { id: 'delta-3', name: 'Delta-3', class: 'Bug Hunter', level: 5, xp: 410, xpNext: 600, mp: 40, status: 'questing', skills: ['bugfix','review'], maxContext: 200000, contextUsed: 56000 },
      { id: 'echo-1',  name: 'Echo-1',  class: 'Refactorer', level: 3, xp: 150, xpNext: 300, mp: 90, status: 'idle',     skills: ['refactor','docs'], maxContext: 128000, contextUsed: 0 },
    ],
  },
  {
    id: 'kenji', name: 'Sato Clan', author: 'Kenji Sato', handle: '@kenjis',
    level: 5, xp: 1820, xpNext: 2500, role: 'member', commits: 31, crest: 'K', color: 'amber',
    adventurers: [
      { id: 'zeta-4', name: 'Zeta-4', class: 'Doc Scribe', level: 2, xp: 60, xpNext: 200, mp: 100, status: 'idle', skills: ['docs','tests'], maxContext: 64000, contextUsed: 0 },
    ],
  },
];

export function hpFromContext(adv) {
  if (!adv) return 0;
  const max = adv.maxContext || 1;
  const used = Math.min(adv.contextUsed || 0, max);
  return Math.round((1 - used / max) * 100);
}

export function fmtTokens(n) {
  if (n == null) return '—';
  if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// =================== SKILL DEFINITIONS ===================

export const SKILL_DEFS = {
  bugfix:    { name: 'Bug Fix',     icon: '✕',  color: 'magenta', desc: 'mend a broken file' },
  refactor:  { name: 'Refactor',    icon: '⟲',  color: 'cyan',    desc: 'simplify a tower' },
  tests:     { name: 'Add Tests',   icon: '✓',  color: 'green',   desc: 'fortify with proofs' },
  review:    { name: 'Code Review', icon: '◉',  color: 'amber',   desc: 'inspect a PR' },
  lint:      { name: 'Lint Pass',   icon: '⚯',  color: 'green',   desc: 'tidy a district' },
  docs:      { name: 'Docs',        icon: '✎',  color: 'cyan',    desc: 'inscribe knowledge' },
};

// =================== ACTIVITY FEED ===================

export const ACTIVITY = [
  { t: '24:17', kind: 'xp',    text: 'Alpha-7 gained 240 XP · Refactor complete' },
  { t: '24:15', kind: 'good',  text: 'TimelineSection.tsx tests passed (12/12)' },
  { t: '24:14', kind: 'quest', text: 'BB-221 posted by Victor Ivanov' },
  { t: '24:12', kind: 'good',  text: 'Delta-3 dispatched to e2e/timeline.spec' },
  { t: '24:09', kind: 'bad',   text: 'Flaky harness · sector e2e' },
  { t: '24:05', kind: 'good',  text: 'PR #142 opened from Alpha-7' },
];

// =================== OBJECTIVES & ALERTS ===================
// (formerly inline in src/game/command.jsx)

export const OBJECTIVES = [
  { id: 'fix-violations', label: 'Fix new violations',  sub: 'Linters: 3 new',     done: true,  prog: 1.0,  meta: '3/3' },
  { id: 'golden-tests',   label: 'Run golden tests',    sub: 'Coverage ≥ 80%',     done: true,  prog: 0.81, meta: '81%' },
  { id: 'clean-pr',       label: 'Merge clean PR',      sub: 'Open PRs: 2',         done: false, prog: 0.5,  meta: '1/2' },
  { id: 'harness-green',  label: 'Keep harness green',  sub: 'All systems nominal', done: false, prog: 0.0,  meta: '◯' },
];

export const ALERTS = [
  { id: 'a1', sev: 'high', title: 'Cyclomatic complexity high', loc: 'lib/github.ts',          who: 'Linters' },
  { id: 'a2', sev: 'med',  title: 'Flaky test detected',         loc: 'e2e/timeline.spec.ts',  who: 'Tests' },
];

// =================== SAGAS (epics) ===================

export const SAGAS = [
  {
    id: 'SAGA-12', title: 'Stabilize the Timeline',
    color: 'magenta', icon: '◈',
    desc: 'Make the work timeline production-ready: stable e2e, refactored sections, accessibility pass.',
    target: 'components-work',
    progress: 0.55,
    questIds: ['JIRA-140','BB-218','JIRA-150'],
  },
  {
    id: 'SAGA-08', title: 'GitHub Integration Hardening',
    color: 'cyan', icon: '◇',
    desc: 'Reduce complexity in github.ts, cache responses, document the API surface.',
    target: 'lib',
    progress: 0.40,
    questIds: ['JIRA-142','BB-221','JIRA-151'],
  },
  {
    id: 'SAGA-15', title: 'Visual Polish · Aurora & Hero',
    color: 'amber', icon: '◆',
    desc: 'Cross-browser polish for the aurora background and hero parallax.',
    target: 'components-ui',
    progress: 0.25,
    questIds: ['JIRA-148','JIRA-149','JIRA-138'],
  },
];

// =================== QUESTS ===================
// Lanes: todo · in-progress · in-review · blocked · done

export const QUESTS_V2 = [
  // ACTIVE / IN-PROGRESS
  { id: 'JIRA-142', source: 'jira', title: 'Refactor github.ts complexity',
    saga: 'SAGA-08', skill: 'refactor', reward: 240, points: 5,
    target: 'lib', file: 'github.ts',
    status: 'active', lane: 'in-progress',
    adventurer: 'alpha-7', guild: 'victor',
    progress: 0.62, eta: '02:14',
    desc: 'Cyclomatic complexity in github.ts has crept above threshold. Split into smaller functions and add coverage.',
    posted: 'Victor Ivanov',
    errands: [
      { id: 'JIRA-142.1', title: 'Extract auth header builder', done: true },
      { id: 'JIRA-142.2', title: 'Split repo fetch + readme fetch', done: true },
      { id: 'JIRA-142.3', title: 'Add unit tests for splits', done: false },
      { id: 'JIRA-142.4', title: 'Update JSDoc', done: false },
    ],
  },
  { id: 'BB-218', source: 'bitbucket', title: 'Flaky e2e on timeline',
    saga: 'SAGA-12', skill: 'tests', reward: 180, points: 3,
    target: 'e2e', file: 'timeline.spec.ts',
    status: 'active', lane: 'in-progress',
    adventurer: 'delta-3', guild: 'maya',
    progress: 0.34, eta: '04:02',
    desc: 'Timeline spec fails ~10% of runs. Stabilize selectors and add retries.',
    posted: 'Victor Ivanov',
    errands: [
      { id: 'BB-218.1', title: 'Reproduce locally', done: true },
      { id: 'BB-218.2', title: 'Replace nth-child selectors', done: false },
      { id: 'BB-218.3', title: 'Add retry config', done: false },
    ],
  },

  // IN-REVIEW
  { id: 'JIRA-150', source: 'jira', title: 'Timeline a11y · keyboard nav',
    saga: 'SAGA-12', skill: 'refactor', reward: 160, points: 3,
    target: 'components-work', file: 'TimelineSection.tsx',
    status: 'active', lane: 'in-review',
    adventurer: 'echo-1', guild: 'maya',
    progress: 0.95, eta: '00:30',
    desc: 'Add keyboard arrow navigation and ARIA roles to the timeline.',
    posted: 'Victor Ivanov',
    pr: { number: 150, additions: 84, deletions: 31, files: 4, reviewers: ['alpha-7','victor'] },
    errands: [
      { id: 'JIRA-150.1', title: 'Roving tabindex', done: true },
      { id: 'JIRA-150.2', title: 'aria-current on active node', done: true },
      { id: 'JIRA-150.3', title: 'Reviewer feedback', done: false },
    ],
  },

  // BLOCKED
  { id: 'JIRA-151', source: 'jira', title: 'Cache GitHub responses · 5m TTL',
    saga: 'SAGA-08', skill: 'refactor', reward: 200, points: 5,
    target: 'lib', file: 'github.ts',
    status: 'active', lane: 'blocked',
    adventurer: 'bravo-2', guild: 'victor',
    progress: 0.20, eta: '—',
    desc: 'Wrap fetches in a TTL cache. Blocked on JIRA-142 (refactor must land first).',
    posted: 'Victor Ivanov',
    blockedBy: ['JIRA-142'],
    errands: [
      { id: 'JIRA-151.1', title: 'Pick cache lib', done: true },
      { id: 'JIRA-151.2', title: 'Wrap fetchRepos', done: false },
      { id: 'JIRA-151.3', title: 'Wrap fetchReadme', done: false },
    ],
  },

  // TODO
  { id: 'JIRA-148', source: 'jira', title: 'Bug: aurora flicker on Safari',
    saga: 'SAGA-15', skill: 'bugfix', reward: 150, points: 3,
    target: 'components-ui', file: 'AuroraBackground.tsx',
    status: 'open', lane: 'todo',
    desc: 'Aurora gradient flickers on Safari < 17. Trace the keyframe and apply a will-change fallback.',
    posted: 'Victor Ivanov',
  },
  { id: 'JIRA-149', source: 'jira', title: 'Add tests for GlassCard',
    saga: 'SAGA-15', skill: 'tests', reward: 120, points: 2,
    target: 'components-ui', file: 'GlassCard.tsx',
    status: 'open', lane: 'todo',
    desc: 'GlassCard has no unit coverage. Add render + interaction tests.',
    posted: 'Victor Ivanov',
  },
  { id: 'BB-221', source: 'bitbucket', title: 'Document the Z-index layering',
    saga: 'SAGA-08', skill: 'docs', reward: 80, points: 1,
    target: 'core', file: 'layout.tsx',
    status: 'open', lane: 'todo',
    desc: 'README mentions z-index table; layout.tsx itself has no JSDoc. Inscribe.',
    posted: 'Victor Ivanov',
  },
  { id: 'BB-222', source: 'bitbucket', title: 'Lint pass on api/',
    skill: 'lint', reward: 60, points: 1,
    target: 'api', file: 'readme/route.ts',
    status: 'open', lane: 'todo',
    desc: 'Three minor violations. Sweep clean.',
    posted: 'Victor Ivanov',
  },

  // DONE
  { id: 'JIRA-140', source: 'jira', title: 'Refactor TimelineSection',
    saga: 'SAGA-12', skill: 'refactor', reward: 220, points: 5,
    target: 'components-work', file: 'TimelineSection.tsx',
    status: 'done', lane: 'done',
    adventurer: 'alpha-7', guild: 'victor',
    desc: 'Split month/year/day rendering into smaller components.',
    posted: 'Victor Ivanov',
    pr: { number: 140, additions: 312, deletions: 188, files: 6, reviewers: ['victor'] },
  },
  { id: 'JIRA-138', source: 'jira', title: 'Code review PR #138',
    saga: 'SAGA-15', skill: 'review', reward: 90, points: 1,
    target: 'components', file: 'HeroSection.tsx',
    status: 'done', lane: 'done',
    adventurer: 'gamma-9', guild: 'victor',
    desc: 'Hero parallax adjustments.',
    posted: 'Victor Ivanov',
    pr: { number: 138, additions: 42, deletions: 18, files: 2, reviewers: ['gamma-9'] },
  },
];

// =================== ADVENTURER REPORTS (PR / review fixtures) ===================
// Keyed by adventurer id for the analysis view.

export const ADV_REPORTS = {
  'alpha-7': {
    pr: {
      number: 142, branch: 'refactor/github-ts', base: 'main',
      title: 'Refactor github.ts complexity',
      adventurer: 'alpha-7', guild: 'victor',
      additions: 168, deletions: 94, files: 5,
      commits: 7, status: 'open',
      reviewers: [
        { who: 'Victor Ivanov', state: 'requested-changes' },
        { who: 'Maya Lin',      state: 'pending' },
      ],
      checks: [
        { name: 'unit · vitest',     state: 'pass', meta: '142/142 · 4.2s' },
        { name: 'e2e · playwright',  state: 'pass', meta: '38/38 · 1m 12s' },
        { name: 'lint · eslint',     state: 'warn', meta: '3 warnings' },
        { name: 'typecheck',         state: 'pass', meta: 'tsc clean' },
        { name: 'coverage',          state: 'pass', meta: '+2.4% · 83.1%' },
        { name: 'bundle size',       state: 'pass', meta: '−1.8 KB' },
      ],
      diffs: [
        { file: 'lib/github.ts', kind: 'modify', add: 92, del: 88, hunks: [
          { line: 14, type: 'del', code: 'export async function fetchRepos(token: string) {' },
          { line: 14, type: 'add', code: 'function buildAuthHeaders(token: string) {' },
          { line: 15, type: 'add', code: '  return { Authorization: `Bearer ${token}` };' },
          { line: 16, type: 'add', code: '}' },
          { line: 18, type: 'add', code: 'export async function fetchRepos(token: string) {' },
          { line: 19, type: 'ctx', code: '  const res = await fetch(REPOS_URL, {' },
          { line: 20, type: 'del', code: '    headers: { Authorization: `Bearer ${token}` },' },
          { line: 20, type: 'add', code: '    headers: buildAuthHeaders(token),' },
          { line: 21, type: 'ctx', code: '  });' },
        ]},
        { file: 'lib/github.test.ts', kind: 'add', add: 64, del: 0, hunks: [
          { line: 1, type: 'add', code: "import { fetchRepos, buildAuthHeaders } from './github';" },
          { line: 2, type: 'add', code: "import { describe, it, expect } from 'vitest';" },
          { line: 4, type: 'add', code: "describe('buildAuthHeaders', () => {" },
          { line: 5, type: 'add', code: "  it('returns Bearer token', () => {" },
          { line: 6, type: 'add', code: "    expect(buildAuthHeaders('x').Authorization).toBe('Bearer x');" },
          { line: 7, type: 'add', code: '  });' },
          { line: 8, type: 'add', code: '});' },
        ]},
        { file: 'lib/types.ts', kind: 'modify', add: 12, del: 6, hunks: [
          { line: 22, type: 'add', code: 'export type GHHeaders = Record<string, string>;' },
        ]},
      ],
      reasoning: [
        { t: '00:14', kind: 'plan',  text: 'Read github.ts. cyclomatic complexity = 18 in fetchRepos. Plan: extract auth header builder, split repo fetch + readme fetch, add unit tests.' },
        { t: '00:42', kind: 'edit',  text: 'Extracted buildAuthHeaders. Replaced two call sites.' },
        { t: '01:08', kind: 'edit',  text: 'Split fetchReadme out of fetchRepos. Added input validation.' },
        { t: '01:36', kind: 'test',  text: 'Wrote 6 unit tests in github.test.ts. All pass.' },
        { t: '01:52', kind: 'lint',  text: 'eslint surfaced 3 unused-import warnings. Cleaned 2; left 1 (intentional re-export).' },
        { t: '02:04', kind: 'pr',    text: 'Opened PR #142. Tagged Victor + Maya for review.' },
      ],
      comments: [
        { who: 'Victor Ivanov', t: '02:18', body: 'Nice split. Can you add a JSDoc to buildAuthHeaders explaining the Bearer prefix?', kind: 'change' },
        { who: 'alpha-7',        t: '02:22', body: 'Will add. Also addressing the leftover lint warning.', kind: 'reply' },
      ],
      risk: { level: 'low', score: 22, factors: [
        'Touches a hot file (github.ts · 4 callers)',
        'Lint warning unresolved',
        'Coverage improved (+2.4%)',
      ]},
    },
  },
  'delta-3': {
    pr: {
      number: 218, branch: 'fix/timeline-flake', base: 'main',
      title: 'Stabilize timeline e2e',
      adventurer: 'delta-3', guild: 'maya',
      additions: 38, deletions: 22, files: 2,
      commits: 3, status: 'draft',
      reviewers: [{ who: 'Victor Ivanov', state: 'pending' }],
      checks: [
        { name: 'unit · vitest',    state: 'pass', meta: '142/142' },
        { name: 'e2e · playwright', state: 'fail', meta: '37/38 · timeline.spec' },
        { name: 'lint',             state: 'pass', meta: 'clean' },
        { name: 'typecheck',        state: 'pass', meta: 'tsc clean' },
      ],
      diffs: [
        { file: 'e2e/timeline.spec.ts', kind: 'modify', add: 24, del: 18, hunks: [
          { line: 8,  type: 'del', code: "  await page.click('.timeline > div:nth-child(3)');" },
          { line: 8,  type: 'add', code: "  await page.getByTestId('timeline-node-2024').click();" },
          { line: 12, type: 'ctx', code: '  await expect(detail).toBeVisible();' },
        ]},
      ],
      reasoning: [
        { t: '00:08', kind: 'plan', text: 'Reproduce flake locally. nth-child selectors break when DOM order shifts.' },
        { t: '00:24', kind: 'edit', text: 'Add data-testid to TimelineNode. Replace selectors.' },
        { t: '00:42', kind: 'test', text: '1/38 still failing — different root cause (race condition).' },
      ],
      comments: [],
      risk: { level: 'medium', score: 54, factors: [
        'One e2e still failing',
        'Selectors changed in 2 places',
      ]},
    },
  },
};
