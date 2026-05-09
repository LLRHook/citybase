import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  app: {
    getPath: vi.fn(() => tmpdir()),
    getAppPath: vi.fn(() => process.cwd()),
  },
  dialog: {},
}));

vi.mock('electron', () => electronMock);

describe('workspaceService self workspace helpers', () => {
  let previousDefault;
  let previousDisable;
  let previousUserData;
  let dir;

  beforeEach(async () => {
    vi.resetModules();
    previousDefault = process.env.CITYBASE_DEFAULT_WORKSPACE;
    previousDisable = process.env.CITYBASE_DISABLE_SELF_WORKSPACE;
    previousUserData = process.env.CITYBASE_USER_DATA;
    delete process.env.CITYBASE_DISABLE_SELF_WORKSPACE;
    dir = await mkdtemp(join(tmpdir(), 'citybase-workspace-'));
    process.env.CITYBASE_USER_DATA = join(dir, 'userData');
    electronMock.app.getPath.mockReturnValue(join(dir, 'userData'));
    electronMock.app.getAppPath.mockReturnValue(process.cwd());
  });

  afterEach(async () => {
    if (previousDefault === undefined) delete process.env.CITYBASE_DEFAULT_WORKSPACE;
    else process.env.CITYBASE_DEFAULT_WORKSPACE = previousDefault;
    if (previousDisable === undefined) delete process.env.CITYBASE_DISABLE_SELF_WORKSPACE;
    else process.env.CITYBASE_DISABLE_SELF_WORKSPACE = previousDisable;
    if (previousUserData === undefined) delete process.env.CITYBASE_USER_DATA;
    else process.env.CITYBASE_USER_DATA = previousUserData;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('strips a UTF-8 BOM before JSON parsing', async () => {
    const { stripBom } = await import('../../electron/main/services/workspaceService.cjs');
    expect(JSON.parse(stripBom('\uFEFF{"ok":true}'))).toEqual({ ok: true });
  });

  it('finds the configured project root when it has package and git markers', async () => {
    await writeFile(join(dir, 'package.json'), '{"name":"citybase"}', 'utf8');
    await mkdir(join(dir, '.git'));
    process.env.CITYBASE_DEFAULT_WORKSPACE = dir;

    const { findSelfWorkspaceRoot } = await import('../../electron/main/services/workspaceService.cjs');

    expect(await findSelfWorkspaceRoot()).toBe(dir);
  });

  it('does not auto-open a root when self workspace is disabled', async () => {
    await writeFile(join(dir, 'package.json'), '{"name":"citybase"}', 'utf8');
    await mkdir(join(dir, '.git'));
    process.env.CITYBASE_DEFAULT_WORKSPACE = dir;
    process.env.CITYBASE_DISABLE_SELF_WORKSPACE = '1';

    const { findSelfWorkspaceRoot } = await import('../../electron/main/services/workspaceService.cjs');

    expect(await findSelfWorkspaceRoot()).toBeNull();
  });

  it('uses the configured project root as the current workspace by default', async () => {
    await writeFile(join(dir, 'package.json'), '{"name":"citybase"}', 'utf8');
    await mkdir(join(dir, '.git'));
    process.env.CITYBASE_DEFAULT_WORKSPACE = dir;

    const { getCurrentWorkspace } = await import('../../electron/main/services/workspaceService.cjs');

    expect(await getCurrentWorkspace()).toMatchObject({
      name: dir.split(/[\\/]/).at(-1),
      rootPath: dir,
    });
  });
});
