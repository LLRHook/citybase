import { spawnSync } from 'node:child_process';
import process from 'node:process';

const godot = process.env.GODOT_BIN || 'godot';
const env = { ...process.env, GODOT_BIN: godot };
const commands = [
  [godot, ['--headless', '--path', 'godot', '--editor', '--import']],
  [godot, ['--headless', '--path', 'godot', '--script', 'res://tests/regression.gd']],
  [process.execPath, ['scripts/test-godot-transport.mjs']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) {
    console.error(`Could not start ${command}: ${result.error.message}. Set GODOT_BIN to Godot 4.7.2.`);
  }
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
