const path = require('node:path');
const fs = require('node:fs');
const processService = require('./processService.cjs');

const MAX_INPUT_BYTES = 128 * 1024 * 1024;

function resolveSnapshotBinary({ override = process.env.CITYBASE_SNAPSHOT_BIN,
  moduleDir = __dirname, executable = process.execPath } = {}) {
  const binaryName = process.platform === 'win32' ? 'citybase-snapshot.exe' : 'citybase-snapshot';
  const source = path.resolve(moduleDir, '../../../native/bin', `${process.platform}-${process.arch}`, binaryName);
  const candidates = override ? [override] : [
    path.join(path.dirname(executable), binaryName), // Godot's bundled core
    source.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1'), // packaged Electron
  ];
  const binary = candidates.find((candidate) => fs.existsSync(candidate));
  if (!binary) throw new Error('Rust snapshot processor missing; run npm run build:native or reinstall the app');
  return binary;
}

async function processSnapshot(input = {}, { run = processService.run, binary = resolveSnapshotBinary() } = {}) {
  const request = JSON.stringify({ ...input, version: 1 });
  if (Buffer.byteLength(request) > MAX_INPUT_BYTES) throw new Error('Snapshot request exceeds 128 MiB');
  const result = await run(binary, [], {
    cwd: path.dirname(binary), stdin: request, timeoutMs: 15000, maxBuffer: 64 * 1024 * 1024,
  });
  if (!result.ok) {
    throw new Error(`Rust snapshot processor failed: ${(result.stderr || result.error?.message || 'unknown error').trim().slice(0, 500)}`);
  }
  let response;
  try { response = JSON.parse(result.stdout); } catch { throw new Error('Invalid Rust snapshot response JSON'); }
  if (response?.version !== 1 || !Array.isArray(response.files) || !Array.isArray(response.repoTree)
    || !Array.isArray(response.recentCommits) || !response.fileSizes || Array.isArray(response.fileSizes)
    || typeof response.fileSizes !== 'object' || typeof response.isDirty !== 'boolean'
    || !(response.branch === null || typeof response.branch === 'string')
    || !Number.isFinite(response.ahead) || !Number.isFinite(response.behind)) {
    throw new Error('Invalid Rust snapshot response shape');
  }
  delete response.version;
  return response;
}

module.exports = { processSnapshot, resolveSnapshotBinary };
