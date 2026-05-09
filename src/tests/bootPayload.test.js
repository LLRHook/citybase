// bootPayload — pure factory; we exercise every fault path so the
// renderer's auto-boot UI never sees a malformed shape.
import { describe, expect, it, vi } from 'vitest';
import { buildBootPayload, EMPTY_DETECT } from '../../electron/main/bootPayload.cjs';

describe('buildBootPayload — shape', () => {
  it('returns { detect, workspace, timestamp }', async () => {
    const out = await buildBootPayload({
      detect: () => ({ codex: { found: true, path: '/x' }, claude: { found: false } }),
      getCurrentWorkspace: async () => ({ id: 'ws-1', name: 'r', rootPath: '/r' }),
    });
    expect(out.detect).toEqual({
      codex: { found: true, path: '/x' },
      claude: { found: false },
    });
    expect(out.workspace).toEqual({ id: 'ws-1', name: 'r', rootPath: '/r' });
    expect(typeof out.timestamp).toBe('number');
  });
});

describe('buildBootPayload — defensive fallbacks', () => {
  it('falls back to EMPTY_DETECT when the detect function throws', async () => {
    const out = await buildBootPayload({
      detect: () => { throw new Error('boom'); },
      getCurrentWorkspace: async () => null,
    });
    expect(out.detect).toEqual(EMPTY_DETECT);
    expect(out.workspace).toBeNull();
  });

  it('falls back to EMPTY_DETECT when detect returns a non-object', async () => {
    const out = await buildBootPayload({
      detect: () => 'nope',
      getCurrentWorkspace: async () => null,
    });
    expect(out.detect).toEqual(EMPTY_DETECT);
  });

  it('returns workspace=null when the workspace getter rejects', async () => {
    const out = await buildBootPayload({
      detect: () => ({ codex: { found: false }, claude: { found: false } }),
      getCurrentWorkspace: async () => { throw new Error('not loaded'); },
    });
    expect(out.workspace).toBeNull();
  });

  it('returns workspace=null when the workspace getter resolves undefined', async () => {
    const out = await buildBootPayload({
      detect: () => ({ codex: { found: false }, claude: { found: false } }),
      getCurrentWorkspace: async () => undefined,
    });
    expect(out.workspace).toBeNull();
  });
});

describe('buildBootPayload — argument validation', () => {
  it('throws when detect is missing', async () => {
    await expect(buildBootPayload({ getCurrentWorkspace: async () => null }))
      .rejects.toThrow(/detect must be a function/);
  });

  it('throws when getCurrentWorkspace is missing', async () => {
    await expect(buildBootPayload({ detect: () => EMPTY_DETECT }))
      .rejects.toThrow(/getCurrentWorkspace must be a function/);
  });
});

describe('buildBootPayload — detect is invoked once per build', () => {
  it('does not re-invoke detect or workspace on a single build', async () => {
    const detect = vi.fn(() => ({ codex: { found: false }, claude: { found: false } }));
    const getCurrentWorkspace = vi.fn(async () => null);
    await buildBootPayload({ detect, getCurrentWorkspace });
    expect(detect).toHaveBeenCalledTimes(1);
    expect(getCurrentWorkspace).toHaveBeenCalledTimes(1);
  });
});
