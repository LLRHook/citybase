// package-v4.mjs — the v4 cutover packaging pipeline (FEAT-027).
//
// Produces a single distributable Citybase.app containing BOTH tiers:
//   1. esbuild flattens core/server.cjs (+ ws) into one CJS file
//   2. `node --build-sea` injects it into an OFFICIAL Node binary
//      (Homebrew node lacks the SEA fuse; the official tarball is cached
//      under build/. macOS arm64 needs native codesign — run on a Mac.)
//   3. Godot exports the frontend (.app)
//   4. the core binary is copied into Contents/Resources/, where main.gd
//      prefers it over the dev node+repo fallback
//
// Usage: node scripts/package-v4.mjs [outDir]   (default: build/)
// Requires: Node 25.5+ (--build-sea), Godot 4.7 at GODOT_BIN or the
// default /Applications path, godot export templates installed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const outDir = path.resolve(repoRoot, process.argv[2] || 'build');
const godotBin = process.env.GODOT_BIN || '/Applications/Godot.app/Contents/MacOS/Godot';
const nodeVersion = process.version; // official binary must match the builder
const seaBase = path.join(outDir, `node-official-${nodeVersion}`);

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
mkdirSync(outDir, { recursive: true });

// 1. Official Node binary (cached).
if (!existsSync(seaBase)) {
  const tarball = path.join(outDir, 'node-official.tar.gz');
  const url = `https://nodejs.org/dist/${nodeVersion}/node-${nodeVersion}-darwin-arm64.tar.gz`;
  console.log(`[package-v4] downloading official node ${nodeVersion}…`);
  run('curl', ['-sL', '--fail', '-o', tarball, url]);
  run('tar', ['-xzf', tarball, '-C', outDir, `node-${nodeVersion}-darwin-arm64/bin/node`]);
  copyFileSync(path.join(outDir, `node-${nodeVersion}-darwin-arm64`, 'bin', 'node'), seaBase);
  chmodSync(seaBase, 0o755);
  rmSync(tarball, { force: true });
  rmSync(path.join(outDir, `node-${nodeVersion}-darwin-arm64`), { recursive: true, force: true });
}

// 2. Bundle + SEA + sign.
console.log('[package-v4] bundling core…');
run('npx', ['esbuild', 'core/server.cjs', '--bundle', '--platform=node', '--format=cjs',
  `--outfile=${path.join(outDir, 'core.bundle.cjs')}`]);
const seaConfig = path.join(outDir, 'sea-config.json');
const coreBinary = path.join(outDir, 'citybase-core');
writeFileSync(seaConfig, JSON.stringify({
  main: path.join(outDir, 'core.bundle.cjs'),
  output: coreBinary,
  executable: seaBase,
  disableExperimentalSEAWarning: true,
}, null, 2));
console.log('[package-v4] building single-executable core…');
rmSync(coreBinary, { force: true });
run('node', ['--build-sea', seaConfig]);
run('codesign', ['--remove-signature', coreBinary]);
run('codesign', ['-s', '-', coreBinary]);

// 3. Godot export.
const appPath = path.join(outDir, 'Citybase.app');
console.log('[package-v4] exporting godot app…');
rmSync(appPath, { recursive: true, force: true });
run(godotBin, ['--headless', '--path', 'godot', '--export-release', 'macOS', appPath]);

// 4. Embed the core.
copyFileSync(coreBinary, path.join(appPath, 'Contents', 'Resources', 'citybase-core'));
chmodSync(path.join(appPath, 'Contents', 'Resources', 'citybase-core'), 0o755);
// The embedded binary changes the bundle contents — re-sign the app ad-hoc.
run('codesign', ['--force', '--deep', '-s', '-', appPath]);

console.log(`[package-v4] done → ${appPath}`);
