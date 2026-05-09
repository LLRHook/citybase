import { describe, expect, it } from 'vitest';
import {
  resolveLaunchTarget,
  WINDOW_BOUNDS,
  DEFAULT_DEV_URL,
} from '../../electron/main/windowConfig.cjs';

const DIST = '/abs/repo/dist/index.html';

describe('WINDOW_BOUNDS', () => {
  it('exports a frozen object with the production window dimensions', () => {
    expect(WINDOW_BOUNDS).toMatchObject({
      width: 1480,
      height: 960,
      minWidth: 1100,
      minHeight: 720,
    });
    expect(Object.isFrozen(WINDOW_BOUNDS)).toBe(true);
  });
});

describe('resolveLaunchTarget', () => {
  it('throws when distIndexPath is missing', () => {
    expect(() => resolveLaunchTarget({})).toThrow(/distIndexPath/);
    expect(() => resolveLaunchTarget({ distIndexPath: '' })).toThrow(/distIndexPath/);
  });

  it('returns the prod target when no dev hints are present', () => {
    const target = resolveLaunchTarget({ argv: ['electron', '.'], env: {}, distIndexPath: DIST });
    expect(target).toEqual({ kind: 'prod', file: DIST, openDevTools: false });
  });

  it('switches to dev when --dev appears anywhere in argv', () => {
    const target = resolveLaunchTarget({
      argv: ['electron', '.', '--dev'],
      env: {},
      distIndexPath: DIST,
    });
    expect(target.kind).toBe('dev');
    expect(target.url).toBe(DEFAULT_DEV_URL);
    expect(target.openDevTools).toBe(true);
    expect('file' in target).toBe(false);
  });

  it('switches to dev when CITYBASE_DEV=1 is set in env', () => {
    const target = resolveLaunchTarget({
      argv: [],
      env: { CITYBASE_DEV: '1' },
      distIndexPath: DIST,
    });
    expect(target.kind).toBe('dev');
    expect(target.url).toBe(DEFAULT_DEV_URL);
  });

  it('does not enter dev mode for CITYBASE_DEV=0 or any non-"1" value', () => {
    expect(
      resolveLaunchTarget({ argv: [], env: { CITYBASE_DEV: '0' }, distIndexPath: DIST }).kind,
    ).toBe('prod');
    expect(
      resolveLaunchTarget({ argv: [], env: { CITYBASE_DEV: 'true' }, distIndexPath: DIST }).kind,
    ).toBe('prod');
  });

  it('honors CITYBASE_DEV_URL over the default vite host', () => {
    const target = resolveLaunchTarget({
      argv: ['--dev'],
      env: { CITYBASE_DEV_URL: 'http://localhost:9999' },
      distIndexPath: DIST,
    });
    expect(target.url).toBe('http://localhost:9999');
  });

  it('honors the explicit devUrl override over the default', () => {
    const target = resolveLaunchTarget({
      argv: ['--dev'],
      env: {},
      devUrl: 'http://localhost:4173',
      distIndexPath: DIST,
    });
    expect(target.url).toBe('http://localhost:4173');
  });

  it('CITYBASE_DEV_URL wins over the function-arg devUrl when both are present', () => {
    const target = resolveLaunchTarget({
      argv: ['--dev'],
      env: { CITYBASE_DEV_URL: 'http://localhost:9999' },
      devUrl: 'http://localhost:4173',
      distIndexPath: DIST,
    });
    expect(target.url).toBe('http://localhost:9999');
  });

  it('does not open dev tools in prod mode', () => {
    const target = resolveLaunchTarget({ argv: [], env: {}, distIndexPath: DIST });
    expect(target.openDevTools).toBe(false);
  });
});
