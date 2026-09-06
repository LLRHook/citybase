import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRepositoryFiles, MAX_FILE_BYTES } from '../../electron/main/services/repositoryFiles.cjs';
import { run } from '../../electron/main/services/processService.cjs';

let folder;
let workspace;
const files = createRepositoryFiles();
beforeEach(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'citybase-inspect-'));
  const rootPath = path.join(folder, 'repo');
  await fs.mkdir(rootPath);
  workspace = { id: 'fixture', rootPath };
});
afterEach(async () => { await fs.rm(folder, { recursive: true, force: true }); });

async function git(...args) {
  const result = await run('git', args, { cwd: workspace.rootPath });
  if (!result.ok) throw new Error(result.stderr);
  return result.stdout;
}

describe('repository file inspection', () => {
  it('reads a real UTF-8 file and reports its byte size', async () => {
    await fs.writeFile(path.join(workspace.rootPath, 'read me.js'), 'const city = "🌇";\n');
    expect(await files.readFile(workspace, 'read me.js')).toEqual({
      path: 'read me.js', content: 'const city = "🌇";\n', size: 21,
      binary: false, truncated: false, error: null,
    });
  });

  it('bounds large files and identifies binary files', async () => {
    await fs.writeFile(path.join(workspace.rootPath, 'big.txt'), 'x'.repeat(MAX_FILE_BYTES + 10));
    const big = await files.readFile(workspace, 'big.txt');
    expect(big.content.length).toBe(MAX_FILE_BYTES);
    expect(big.truncated).toBe(true);
    await fs.writeFile(path.join(workspace.rootPath, 'asset.bin'), Buffer.from([0, 17, 254]));
    expect(await files.readFile(workspace, 'asset.bin')).toMatchObject({ binary: true, content: '', error: null });
  });

  it('denies traversal, absolute paths, directories and Git internals', async () => {
    await fs.mkdir(path.join(workspace.rootPath, '.git'));
    await fs.writeFile(path.join(workspace.rootPath, '.git', 'config'), 'private');
    for (const name of ['../outside', '/etc/passwd', 'C:\\private', '.git/config', '.']) {
      expect((await files.readFile(workspace, name)).error, name).toBeTruthy();
      expect((await files.getFileDiff(workspace, name)).error, name).toBeTruthy();
    }
  });

  it('denies symlinks outside the root and aliases into Git internals', async () => {
    await fs.writeFile(path.join(folder, 'private.txt'), 'private');
    await fs.symlink(path.join(folder, 'private.txt'), path.join(workspace.rootPath, 'escape.txt'));
    await fs.symlink(folder, path.join(workspace.rootPath, 'escape-dir'));
    await fs.mkdir(path.join(workspace.rootPath, '.git'));
    await fs.writeFile(path.join(workspace.rootPath, '.git', 'config'), 'private');
    await fs.symlink('.git/config', path.join(workspace.rootPath, 'alias.txt'));
    for (const name of ['escape.txt', 'escape-dir/missing.txt', 'alias.txt']) {
      expect((await files.readFile(workspace, name)).error, name).toBeTruthy();
      expect((await files.getFileDiff(workspace, name)).error, name).toBeTruthy();
    }
  });

  it('surfaces deleted files without rejecting the IPC operation', async () => {
    const out = await files.readFile(workspace, 'gone.js');
    expect(out.error.message).toMatch(/no longer exists/);
  });
});

describe('repository file diff', () => {
  async function committedFixture() {
    await git('init', '-q');
    await fs.writeFile(path.join(workspace.rootPath, 'city.txt'), 'original one\noriginal two\n');
    await git('add', 'city.txt');
    await git('-c', 'user.name=Victor Ivanov', '-c', 'user.email=vivanov@paradigmtesting.com', 'commit', '-qm', 'test: initial fixture');
  }

  it('includes staged and unstaged edits, without touching the index', async () => {
    await committedFixture();
    await fs.writeFile(path.join(workspace.rootPath, 'city.txt'), 'staged one\noriginal two\n');
    await git('add', 'city.txt');
    await fs.writeFile(path.join(workspace.rootPath, 'city.txt'), 'staged one\nunstaged two\n');
    const indexPath = path.join(workspace.rootPath, '.git', 'index');
    const before = await fs.readFile(indexPath);
    const out = await files.getFileDiff(workspace, 'city.txt');
    expect(out.error).toBeNull();
    expect(out.text).toContain('+staged one');
    expect(out.text).toContain('+unstaged two');
    expect(await fs.readFile(indexPath)).toEqual(before);
  });

  it('shows a tracked deletion and an unchanged tracked file correctly', async () => {
    await committedFixture();
    expect(await files.getFileDiff(workspace, 'city.txt')).toEqual({ text: '', truncated: false, error: null });
    await fs.unlink(path.join(workspace.rootPath, 'city.txt'));
    const out = await files.getFileDiff(workspace, 'city.txt');
    expect(out.text).toContain('-original one');
    expect(out.error).toBeNull();
  });

  it('shows untracked additions and treats pathspec magic as a literal filename', async () => {
    await committedFixture();
    const name = ':(glob)*.txt';
    await fs.writeFile(path.join(workspace.rootPath, name), 'new building\n');
    const statusBefore = await git('status', '--porcelain');
    const out = await files.getFileDiff(workspace, name);
    expect(out.text).toContain('+new building');
    expect(out.text).not.toContain('original one');
    expect(out.error).toBeNull();
    expect(await git('status', '--porcelain')).toBe(statusBefore);
  });

  it('supports staged files before the first commit', async () => {
    await git('init', '-q');
    await fs.writeFile(path.join(workspace.rootPath, 'new.txt'), 'first building\n');
    await git('add', 'new.txt');
    const out = await files.getFileDiff(workspace, 'new.txt');
    expect(out.error).toBeNull();
    expect(out.text).toContain('+first building');
  });
});
