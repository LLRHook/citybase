// data.js — single source of truth for the demo state.
// Models the my-website repo as a city. Folders = districts, files = buildings.
// Authors = guilds. Coding agents under each author = adventurers.
// Tasks from Jira / issues from Bitbucket = quests.

export const REPO = {
  name: 'my-website',
  remote: 'bitbucket.org/llrhook/my-website',
  branch: 'main',
  commit: 'a4a9f82',
};

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

export const SKILL_DEFS = {
  bugfix:    { name: 'Bug Fix',     icon: '✕',  color: 'magenta', desc: 'mend a broken file' },
  refactor:  { name: 'Refactor',    icon: '⟲',  color: 'cyan',    desc: 'simplify a tower' },
  tests:     { name: 'Add Tests',   icon: '✓',  color: 'green',   desc: 'fortify with proofs' },
  review:    { name: 'Code Review', icon: '◉',  color: 'amber',   desc: 'inspect a PR' },
  lint:      { name: 'Lint Pass',   icon: '⚯',  color: 'green',   desc: 'tidy a district' },
  docs:      { name: 'Docs',        icon: '✎',  color: 'cyan',    desc: 'inscribe knowledge' },
};

export const ACTIVITY = [
  { t: '24:17', kind: 'xp',    text: 'Alpha-7 gained 240 XP · Refactor complete' },
  { t: '24:15', kind: 'good',  text: 'TimelineSection.tsx tests passed (12/12)' },
  { t: '24:14', kind: 'quest', text: 'BB-221 posted by Victor Ivanov' },
  { t: '24:12', kind: 'good',  text: 'Delta-3 dispatched to e2e/timeline.spec' },
  { t: '24:09', kind: 'bad',   text: 'Flaky harness · sector e2e' },
  { t: '24:05', kind: 'good',  text: 'PR #142 opened from Alpha-7' },
];
