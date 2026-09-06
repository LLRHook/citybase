// Bounded, read-only building inspection. Never alter the Git index to view a file.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const processService = require('./processService.cjs');

const MAX_FILE_BYTES = 128 * 1024;
const MAX_DIFF_BYTES = 256 * 1024;

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function checkRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\0')
    || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)
    || relativePath.split(/[\\/]/).some((p) => p === '..' || p.toLowerCase() === '.git')) {
    throw new Error('Choose a file inside this repository');
  }
}

async function resolveRepositoryPath(workspace, relativePath) {
  checkRelativePath(relativePath);
  const root = await fs.realpath(workspace.rootPath);
  const target = path.resolve(root, relativePath);
  if (!inside(root, target) || target === root) throw new Error('Choose a file inside this repository');
  // A deleted file is still inspectable as a diff. Resolve the closest existing
  // parent in that case, so a missing child under an escaping symlink is denied.
  let existing = target;
  for (;;) {
    try {
      const real = await fs.realpath(existing);
      if (!inside(root, real)) throw new Error('File points outside this repository');
      const realRelative = path.relative(root, real);
      if (realRelative.split(path.sep).some((p) => p.toLowerCase() === '.git')) {
        throw new Error('Git internal files are not city buildings');
      }
      if (existing === target && !(await fs.stat(real)).isFile()) throw new Error('Choose a regular file');
      return { root, target: path.resolve(real, path.relative(existing, target)), path: path.relative(root, target).split(path.sep).join('/') };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      existing = path.dirname(existing);
    }
  }
}

function errorInfo(err) {
  return { message: err.code === 'ENOENT' ? 'This file no longer exists in the working tree' : err.message || String(err) };
}

function createRepositoryFiles({ run = processService.run } = {}) {
  async function readFile(workspace, relativePath) {
    const out = { path: relativePath, content: '', binary: false, truncated: false, size: 0, error: null };
    let handle;
    try {
      const resolved = await resolveRepositoryPath(workspace, relativePath);
      out.path = resolved.path;
      handle = await fs.open(resolved.target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = await handle.stat();
      if (!stat.isFile()) throw new Error('Choose a file, rather than a directory');
      out.size = stat.size;
      const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      out.truncated = bytesRead > MAX_FILE_BYTES || stat.size > MAX_FILE_BYTES;
      const bytes = buffer.subarray(0, Math.min(bytesRead, MAX_FILE_BYTES));
      out.binary = bytes.includes(0);
      if (!out.binary) {
        try {
          out.content = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: out.truncated });
        } catch { out.binary = true; }
      }
    } catch (err) { out.error = errorInfo(err); }
    finally { if (handle) await handle.close(); }
    return out;
  }

  async function getFileDiff(workspace, relativePath) {
    const out = { text: '', truncated: false, error: null };
    try {
      const resolved = await resolveRepositoryPath(workspace, relativePath);
      const options = { cwd: resolved.root, maxBuffer: MAX_DIFF_BYTES };
      const head = await run('git', ['rev-parse', '--verify', 'HEAD'], options);
      // An unborn repository has no HEAD. Hash an empty tree without writing an
      // object, which works for the repository's configured object format.
      const base = head.ok ? 'HEAD' : (await run('git', ['hash-object', '-t', 'tree', '--stdin'], { ...options, stdin: '' })).stdout?.trim();
      if (!base) throw new Error('Cannot read this repository’s Git changes');
      const result = await run('git', ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--unified=3', '--no-color', base, '--', resolved.path], options);
      out.text = (result.stdout || '').slice(0, MAX_DIFF_BYTES);
      out.truncated = result.error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || Buffer.byteLength(result.stdout || '') >= MAX_DIFF_BYTES;
      if (!result.ok && !out.truncated) throw new Error(result.stderr?.trim() || 'Cannot read file changes');
      if (out.text || out.truncated) return out;

      const tracked = await run('git', ['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', resolved.path], options);
      if (tracked.ok) return out;
      const file = await readFile(workspace, relativePath);
      if (file.error) return { ...out, error: file.error };
      out.truncated = file.truncated;
      if (file.binary) out.text = `Binary file ${resolved.path} is untracked`;
      else {
        const lines = file.content.split('\n');
        if (lines.at(-1) === '') lines.pop();
        out.text = [`--- /dev/null`, `+++ b/${resolved.path}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join('\n');
        if (Buffer.byteLength(out.text) > MAX_DIFF_BYTES) {
          out.text = Buffer.from(out.text).subarray(0, MAX_DIFF_BYTES).toString('utf8');
          out.truncated = true;
        }
      }
    } catch (err) { out.error = errorInfo(err); }
    return out;
  }

  return { readFile, getFileDiff };
}

module.exports = { createRepositoryFiles, resolveRepositoryPath, MAX_FILE_BYTES, MAX_DIFF_BYTES, ...createRepositoryFiles() };
