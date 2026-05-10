// Preload contract tests. These exist because we shipped a real bug
// where preload.cjs `require()`-d ../main/agents/constants.cjs under
// sandbox: true. Electron's sandbox forbids arbitrary user-land
// requires, so the preload silently failed to load, window.citybase
// was never attached, and the renderer fell back to a stub forever.
//
// Two invariants this file enforces:
//   1. preload.cjs MUST NOT require any user-land path. Only
//      require('electron') (and other electron-builtin allowlists if
//      we ever add them) is sandbox-safe.
//   2. The channel names hardcoded as literals in preload.cjs MUST
//      match the canonical exports in agents/constants.cjs, so the
//      renderer side and the main side never drift.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AGENT_EVENT_CHANNEL,
  BOOT_PAYLOAD_CHANNEL,
} from '../../electron/main/agents/constants.cjs';

const PRELOAD_PATH = resolve(__dirname, '../../electron/preload/preload.cjs');
const PRELOAD_SOURCE = readFileSync(PRELOAD_PATH, 'utf8');

describe('preload.cjs — sandbox safety', () => {
  it('only require()s `electron` (no user-land paths)', () => {
    // Match every `require('...')` / `require("...")` call.
    const requires = [...PRELOAD_SOURCE.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((m) => m[1]);
    expect(requires.length).toBeGreaterThan(0);
    for (const spec of requires) {
      expect(
        spec === 'electron',
        `preload.cjs requires '${spec}' — only 'electron' is sandbox-safe. `
        + 'Inline the value as a literal or move the consumer out of preload.',
      ).toBe(true);
    }
  });
});

describe('preload.cjs — channel literals stay in sync with constants.cjs', () => {
  it('embeds the same AGENT_EVENT_CHANNEL string the main process exports', () => {
    expect(PRELOAD_SOURCE).toContain(`'${AGENT_EVENT_CHANNEL}'`);
  });

  it('embeds the same BOOT_PAYLOAD_CHANNEL string the main process exports', () => {
    expect(PRELOAD_SOURCE).toContain(`'${BOOT_PAYLOAD_CHANNEL}'`);
  });
});
