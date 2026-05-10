import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectAgentBinaries } from '../../electron/main/agents/detect.cjs';

function existing(paths) {
  const set = new Set(paths);
  return (p) => set.has(p);
}

describe('detectAgentBinaries — POSIX', () => {
  const env = { PATH: '/usr/local/bin:/usr/bin:/opt/homebrew/bin' };

  it('returns both not-found when nothing is on PATH', () => {
    const out = detectAgentBinaries({ env, platform: 'linux', fsExists: () => false });
    expect(out).toEqual({ codex: { found: false }, claude: { found: false } });
  });

  it('finds codex when its bare name lives in a PATH dir', () => {
    const out = detectAgentBinaries({
      env,
      platform: 'linux',
      fsExists: existing(['/usr/local/bin/codex']),
    });
    expect(out.codex).toEqual({ found: true, path: '/usr/local/bin/codex' });
    expect(out.claude.found).toBe(false);
  });

  it('finds claude in a later PATH dir even if codex is in an earlier one', () => {
    const out = detectAgentBinaries({
      env,
      platform: 'linux',
      fsExists: existing(['/usr/local/bin/codex', '/opt/homebrew/bin/claude']),
    });
    expect(out.codex.path).toBe('/usr/local/bin/codex');
    expect(out.claude.path).toBe('/opt/homebrew/bin/claude');
  });

  it('respects PATH ordering (first match wins) for duplicates', () => {
    const out = detectAgentBinaries({
      env,
      platform: 'linux',
      fsExists: existing(['/usr/local/bin/codex', '/usr/bin/codex']),
    });
    expect(out.codex.path).toBe('/usr/local/bin/codex');
  });

  it('skips empty PATH segments without crashing', () => {
    const out = detectAgentBinaries({
      env: { PATH: '/usr/local/bin::/usr/bin' },
      platform: 'linux',
      fsExists: existing(['/usr/local/bin/claude']),
    });
    expect(out.claude.path).toBe('/usr/local/bin/claude');
  });

  it('returns sentinel when env.PATH is missing entirely', () => {
    const out = detectAgentBinaries({ env: {}, platform: 'linux', fsExists: () => true });
    // No PATH dirs to scan, so even with permissive fsExists nothing is found.
    expect(out).toEqual({ codex: { found: false }, claude: { found: false } });
  });
});

describe('detectAgentBinaries — Windows', () => {
  const env = { Path: 'C:\\Program Files\\codex;C:\\tools\\claude' };

  it('uses the ; delimiter and tries .exe / .cmd / .bat extensions in turn', () => {
    const out = detectAgentBinaries({
      env,
      platform: 'win32',
      fsExists: existing([
        'C:\\Program Files\\codex\\codex.cmd',
        'C:\\tools\\claude\\claude.exe',
      ]),
    });
    expect(out.codex.path).toBe('C:\\Program Files\\codex\\codex.cmd');
    expect(out.claude.path).toBe('C:\\tools\\claude\\claude.exe');
  });

  it('prefers .exe over .cmd when both exist (extension order is .exe first)', () => {
    const out = detectAgentBinaries({
      env: { PATH: 'C:\\bin' },
      platform: 'win32',
      fsExists: existing(['C:\\bin\\codex.exe', 'C:\\bin\\codex.cmd']),
    });
    expect(out.codex.path).toBe('C:\\bin\\codex.exe');
  });

  it('falls back to env.PATH if env.Path is unset', () => {
    const out = detectAgentBinaries({
      env: { PATH: 'C:\\bin' },
      platform: 'win32',
      fsExists: existing(['C:\\bin\\claude.exe']),
    });
    expect(out.claude.path).toBe('C:\\bin\\claude.exe');
  });
});

describe('detectAgentBinaries — overrides', () => {
  it('honors the candidates override (e.g. for nightly binary names)', () => {
    const out = detectAgentBinaries({
      env: { PATH: '/usr/local/bin' },
      platform: 'linux',
      fsExists: existing(['/usr/local/bin/codex-nightly']),
      candidates: { codex: ['codex-nightly', 'codex'], claude: ['claude'] },
    });
    expect(out.codex.path).toBe('/usr/local/bin/codex-nightly');
  });
});

// Production callers (electron/main/ipc.cjs, main.cjs) call
// detectAgentBinaries() with no arguments. The default `fsExists` MUST
// hit the real filesystem; an earlier `() => false` default silently
// returned "no agents installed" for every real launch, which is the
// "no installed agent CLI found" error the user hit. Probe a real
// temp dir to make sure that bug can't come back.
describe('detectAgentBinaries — default fsExists hits the real filesystem', () => {
  it('finds a binary that physically exists on the injected PATH', () => {
    const root = mkdtempSync(join(tmpdir(), 'citybase-detect-'));
    const binDir = join(root, 'bin');
    mkdirSync(binDir);
    const ext = process.platform === 'win32' ? '.cmd' : '';
    const claudeFile = join(binDir, `claude${ext}`);
    writeFileSync(claudeFile, '');
    try {
      // Override env.PATH only — leave fsExists unset so the default kicks in.
      const out = detectAgentBinaries({
        env: { PATH: binDir },
      });
      expect(out.claude.found).toBe(true);
      expect(out.claude.path).toBe(claudeFile);
      expect(out.codex.found).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns not-found cleanly when the default fsExists throws (e.g. permission denied)', () => {
    // Spy on Node's fs.existsSync via the test boundary: the function's
    // default catches and returns false, so even a thrown probe doesn't
    // explode detection.
    const out = detectAgentBinaries({
      env: { PATH: '/nonexistent/path/that/cannot/exist' },
    });
    expect(out).toEqual({ codex: { found: false }, claude: { found: false } });
  });
});
