import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { nativeBuildPlan } from './native-build-plan.cjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const platform = process.argv.find((arg) => arg.startsWith('--platform='))?.slice(11) || process.platform;
const arch = process.argv.find((arg) => arg.startsWith('--arch='))?.slice(7) || process.arch;
const plan = nativeBuildPlan(root, platform, arch);
const manifest = path.join(root, 'native', 'Cargo.toml');
const result = spawnSync('cargo', ['build', '--release', '--locked', '--target', plan.target, '--manifest-path', manifest], { cwd: root, stdio: 'inherit' });
if (result.error || result.status !== 0) {
  console.error(result.error?.message || 'Native snapshot build failed');
  process.exit(result.status || 1);
}
const target = process.env.CARGO_TARGET_DIR ? path.resolve(root, process.env.CARGO_TARGET_DIR) : path.join(root, 'native', 'target');
const destination = plan.destination;
mkdirSync(path.dirname(destination), { recursive: true });
copyFileSync(path.join(target, plan.target, 'release', plan.binary), destination);
chmodSync(destination, 0o755);
console.log(`Built native snapshot processor (${platform}/${arch})`);
