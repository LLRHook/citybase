import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { processSnapshot, resolveSnapshotBinary } from '../../electron/main/services/snapshotProcessor.cjs';
import { createGitService } from '../../electron/main/services/gitService.cjs';
import { legacySnapshot } from './fixtures/legacySnapshot.cjs';
import { nativeBuildPlan } from '../../scripts/native-build-plan.cjs';
import { buildForPack } from '../../scripts/before-pack-native.cjs';

const statusLine = (xy, file) => `1 ${xy} N... 100644 100644 100644 h1 h2 ${file}`;
const fixtures = [
  {},
  { status: '# branch.head main\n# branch.ab +3 -2\n', log: 'abc\t2026-11-06T00:00:00Z\ttitle\twith tab\r\n', tree: 'README.md\0src/café file.js\0', sizes: '100644 blob h 123\tsrc/café file.js\0' },
  { status: '# branch.head (detached)\n? new file.js\n' },
  { status: ['M.', '.M', 'MM', 'A.', '.D', 'UU', 'C.', '.C', 'ZZ'].map((xy) => statusLine(xy, `file-${xy}.js`)).join('\n') },
  { status: '2 R. N... 100644 100644 100644 h1 h2 R100 new file.js\told.js\nu UU N... 100644 100644 100644 100644 h1 h2 h3 conflict.js\n' },
  { status: '# branch.ab invalid\nignored\n', log: 'old\told subject\nonly-hash\n', sizes: ['malformed', '160000 commit h -\tsub', '100644 blob h NaN\tbad'].join('\0') },
];

describe('required Rust snapshot processor', () => {
  it.each(fixtures.map((input, index) => ({ input, index })))('matches the pre-port snapshot for fixture $index', async ({ input }) => {
    expect(await processSnapshot(input)).toEqual(legacySnapshot(input));
  });

  it('matches a deterministic corpus of staged/unstaged and Unicode path combinations', async () => {
    const statuses = ['.', 'M', 'A', 'D', 'R', 'C', 'U', '?', 'Z'];
    const input = {
      status: statuses.flatMap((x) => statuses.map((y) => statusLine(x + y, `src/é-${x}${y} file.js`))).join('\n'),
      tree: Array.from({ length: 2500 }, (_, i) => `district-${i % 50}/file-${i} é.js`).join('\0') + '\0',
      sizes: Array.from({ length: 2500 }, (_, i) => `100644 blob hash ${i * 157}\tdistrict-${i % 50}/file-${i} é.js`).join('\0'),
    };
    expect(await processSnapshot(input)).toEqual(legacySnapshot(input));
  });

  it('rejects invalid field types through the actual executable', async () => {
    await expect(processSnapshot({ tree: 42 })).rejects.toThrow(/snapshot fields must be strings/);
  });

  it('rejects malformed JSON and unknown protocol versions without outputting a fake snapshot', () => {
    const binary = resolveSnapshotBinary();
    for (const input of ['not-json', '{"version":2}']) {
      try {
        execFileSync(binary, [], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        throw new Error('expected refusal');
      } catch (error) {
        expect(error.status).toBe(2);
        expect(error.stdout).toBe('');
        expect(error.stderr).toMatch(/invalid snapshot JSON|expected snapshot request version 1/);
      }
    }
  });

  it('propagates timeout/process failures instead of silently using a JS parser', async () => {
    const run = vi.fn(async () => ({ ok: false, stderr: '', error: { message: 'fixture timeout' } }));
    await expect(processSnapshot({}, { run, binary: '/synthetic/processor' })).rejects.toThrow('fixture timeout');
    expect(run).toHaveBeenCalledWith('/synthetic/processor', [], expect.objectContaining({ timeoutMs: 15000, stdin: '{"version":1}' }));
  });

  it.each(['not-json', '{"version":2}', '{"version":1,"files":[]}'])('rejects invalid native response %s', async (stdout) => {
    const run = async () => ({ ok: true, stdout });
    await expect(processSnapshot({}, { run, binary: '/synthetic/processor' })).rejects.toThrow(/Invalid Rust snapshot response/);
  });

  it('an explicit missing binary cannot fall back to a different installation', () => {
    expect(() => resolveSnapshotBinary({ override: '/missing-citybase-native-processor' })).toThrow(/processor missing/);
  });

  it('resolves the unpacked helper for Electron and the sibling helper for the bundled Godot core', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'citybase-native-package-'));
    try {
      const name = process.platform === 'win32' ? 'citybase-snapshot.exe' : 'citybase-snapshot';
      const moduleDir = path.join(dir, 'app.asar', 'electron', 'main', 'services');
      const unpacked = path.join(dir, 'app.asar.unpacked', 'native', 'bin', `${process.platform}-${process.arch}`, name);
      await mkdir(path.dirname(unpacked), { recursive: true });
      await writeFile(unpacked, 'synthetic package path fixture');
      expect(resolveSnapshotBinary({ override: '', moduleDir, executable: path.join(dir, 'Electron') })).toBe(unpacked);
      const core = path.join(dir, 'Resources', 'citybase-core');
      const sibling = path.join(path.dirname(core), name);
      await mkdir(path.dirname(core), { recursive: true });
      await writeFile(sibling, 'synthetic bundle path fixture');
      expect(resolveSnapshotBinary({ override: '', moduleDir, executable: core })).toBe(sibling);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('normal Git snapshots use the required executable on a real throwaway repo', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'citybase-native-git-'));
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    try {
      git('init', '-b', 'main');
      await mkdir(path.join(dir, 'src'));
      await writeFile(path.join(dir, 'src', 'café file.js'), 'export const fixture = 1;\n');
      await writeFile(path.join(dir, 'README.md'), '# Synthetic native fixture\n');
      git('add', '--', 'src', 'README.md');
      git('-c', 'user.name=Victor Ivanov', '-c', 'user.email=victor.n.ivanov@gmail.com', 'commit', '-m', 'test: create synthetic fixture');
      await writeFile(path.join(dir, 'src', 'café file.js'), 'export const fixture = 2;\n');
      await writeFile(path.join(dir, 'untracked.txt'), 'synthetic\n');
      const snapshot = await createGitService().getSnapshot({ id: 'synthetic-ws', rootPath: dir });
      const input = {
        status: git('-c', 'core.quotePath=false', 'status', '--porcelain=v2', '--branch'),
        log: git('log', '--pretty=format:%h%x09%cI%x09%s', '-n', '30'),
        tree: git('ls-files', '-z'), sizes: git('ls-tree', '-r', '-l', '-z', 'HEAD'),
      };
      expect(snapshot).toEqual({ workspaceId: 'synthetic-ws', rootPath: dir, ...legacySnapshot(input), error: null });
      expect(snapshot.files.find((f) => f.path === 'src/café file.js')).toMatchObject({ unstaged: true, status: 'modified' });
      const oldOverride = process.env.CITYBASE_SNAPSHOT_BIN;
      process.env.CITYBASE_SNAPSHOT_BIN = '/missing-required-citybase-processor';
      try { await expect(createGitService().getSnapshot({ id: 'synthetic-ws', rootPath: dir })).rejects.toThrow(/processor missing/); }
      finally {
        if (oldOverride === undefined) delete process.env.CITYBASE_SNAPSHOT_BIN;
        else process.env.CITYBASE_SNAPSHOT_BIN = oldOverride;
      }
      git('checkout', '--detach');
      expect((await createGitService().getSnapshot({ id: 'synthetic-ws', rootPath: dir })).branch).toBeNull();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('preserves empty-repository and non-Git error behavior', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'citybase-native-empty-'));
    try {
      const service = createGitService();
      const workspace = { id: 'empty-ws', rootPath: dir };
      expect((await service.getSnapshot(workspace)).error).toMatchObject({ kind: 'no-git' });
      execFileSync('git', ['-C', dir, 'init', '-b', 'main'], { stdio: 'ignore' });
      expect(await service.getSnapshot(workspace)).toMatchObject({ branch: 'main', files: [], recentCommits: [], repoTree: [], fileSizes: {}, error: null });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe('native packaging architecture', () => {
  it.each([['darwin', 'arm64', 'aarch64-apple-darwin'], ['darwin', 'x64', 'x86_64-apple-darwin'], ['win32', 'x64', 'x86_64-pc-windows-msvc'], ['linux', 'x64', 'x86_64-unknown-linux-gnu']])('selects %s %s correctly', (platform, arch, target) => {
    const plan = nativeBuildPlan('/synthetic', platform, arch);
    expect(plan.target).toBe(target);
    expect(plan.destination).toContain(`${platform}-${arch}`);
  });

  it('runs the required build before packing the selected architecture', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    buildForPack({ arch: 1, electronPlatformName: 'darwin', packager: { projectDir: '/synthetic' } }, spawn);
    expect(spawn).toHaveBeenCalledWith(process.execPath, [path.join('/synthetic', 'scripts', 'build-native.mjs'), '--platform=darwin', '--arch=x64'], expect.objectContaining({ cwd: '/synthetic' }));
  });

  it('refuses a failed native build and unsupported package architecture', () => {
    const context = { arch: 3, electronPlatformName: 'darwin', packager: { projectDir: '/synthetic' } };
    expect(() => buildForPack(context, () => ({ status: 1 }))).toThrow(/Native snapshot build failed/);
    expect(() => buildForPack({ ...context, arch: 4 }, vi.fn())).toThrow(/Unsupported native snapshot target/);
  });
});
