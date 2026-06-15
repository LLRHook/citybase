import { describe, expect, it } from 'vitest';
import { resolveProvider, PREFERRED_ORDER } from '../../electron/main/agents/resolveProvider.cjs';

describe('resolveProvider', () => {
  it('exposes the canonical preference order (claude is the v1 default)', () => {
    expect([...PREFERRED_ORDER]).toEqual(['claude', 'codex']);
  });

  it('picks claude when both are installed and registered (v1 default)', () => {
    expect(resolveProvider(
      { codex: { found: true, path: '/c/codex' }, claude: { found: true, path: '/c/claude' } },
      ['codex', 'claude'],
    )).toBe('claude');
  });

  it('falls back to codex when only codex is installed', () => {
    expect(resolveProvider(
      { codex: { found: true, path: '/c/codex' }, claude: { found: false } },
      ['codex', 'claude'],
    )).toBe('codex');
  });

  it('skips an installed CLI that is not registered with the manager', () => {
    expect(resolveProvider(
      { codex: { found: true }, claude: { found: true } },
      ['claude'],
    )).toBe('claude');
  });

  it('throws when no preferred provider is both registered AND installed', () => {
    expect(() => resolveProvider(
      { codex: { found: false }, claude: { found: false } },
      ['codex', 'claude'],
    )).toThrow(/no installed agent CLI found/);
  });

  it('tolerates missing fields in the detect result', () => {
    expect(() => resolveProvider({}, ['codex', 'claude'])).toThrow(/no installed agent CLI found/);
    expect(() => resolveProvider(null, ['codex'])).toThrow(/no installed agent CLI found/);
  });

  it('tolerates a non-array registered list', () => {
    expect(() => resolveProvider({ codex: { found: true } }, undefined)).toThrow(/no installed/);
  });
});
