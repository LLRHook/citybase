// workspaceServiceCore.cjs — pure workspace registry factory (FEAT-022).
// Runtime-agnostic: no `require('electron')`. The Electron shell wraps it in
// workspaceService.cjs (userData dir + native folder dialog injected); the
// headless citybase-core daemon instantiates it with a platform userData dir
// and no dialog — frontends register validated paths via registerWorkspacePath.
//
// Storage: a single JSON file <userDataDir>/workspaces.json.
const path = require('node:path');
const crypto = require('node:crypto');

const STATE_FILENAME = 'workspaces.json';
const MAX_RECENT = 12;

function createWorkspaceService({
  getUserDataDir,
  showOpenDialog = null,
  fs = require('node:fs/promises'),
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof getUserDataDir !== 'function') {
    throw new TypeError('createWorkspaceService: getUserDataDir must be a function');
  }

  function statePath() {
    return path.join(getUserDataDir(), STATE_FILENAME);
  }

  async function readState() {
    try {
      const raw = await fs.readFile(statePath(), 'utf8');
      const parsed = JSON.parse(stripBom(raw));
      if (!parsed || typeof parsed !== 'object') return emptyState();
      return {
        currentId: typeof parsed.currentId === 'string' ? parsed.currentId : null,
        workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces.filter(isValidWorkspace) : [],
      };
    } catch (err) {
      if (err && err.code === 'ENOENT') return emptyState();
      console.warn('citybase: failed to read workspace state, starting empty', err);
      return emptyState();
    }
  }

  async function writeState(state) {
    const file = statePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(state, null, 2), 'utf8');
  }

  // Validate + persist a filesystem path as the current workspace. This is
  // the primitive both entry points share: the Electron dialog resolves to
  // it, and the core's `workspace.registerPath` RPC calls it directly with
  // a frontend-chosen path.
  async function registerWorkspacePath(rootPath) {
    if (typeof rootPath !== 'string' || !rootPath) {
      throw new TypeError('registerWorkspacePath: rootPath must be a non-empty string');
    }
    const real = await fs.realpath(rootPath);
    const stat = await fs.stat(real);
    if (!stat.isDirectory()) {
      throw new Error(`not a directory: ${real}`);
    }
    const state = await readState();
    const id = workspaceIdFor(real);
    const stamp = now();
    const existing = state.workspaces.find(w => w.id === id);
    const ws = {
      id,
      name: nameFor(real),
      rootPath: real,
      openedAt: existing ? existing.openedAt : stamp,
      lastOpenedAt: stamp,
    };
    const others = state.workspaces.filter(w => w.id !== id);
    state.workspaces = [ws, ...others].slice(0, MAX_RECENT);
    state.currentId = id;
    await writeState(state);
    return ws;
  }

  async function pickWorkspace({ window } = {}) {
    if (typeof showOpenDialog !== 'function') {
      throw new Error('workspace.pick is not available in headless mode; use workspace.registerPath');
    }
    const chosen = await showOpenDialog(window);
    if (!chosen) return null;
    return registerWorkspacePath(chosen);
  }

  async function getCurrentWorkspace() {
    const state = await readState();
    if (!state.currentId) return null;
    return state.workspaces.find(w => w.id === state.currentId) || null;
  }

  async function setCurrentWorkspace(id) {
    const state = await readState();
    const found = state.workspaces.find(w => w.id === id);
    if (!found) throw new Error(`unknown workspace id: ${id}`);
    state.currentId = id;
    found.lastOpenedAt = now();
    state.workspaces = [found, ...state.workspaces.filter(w => w.id !== id)];
    await writeState(state);
    return found;
  }

  async function listRecentWorkspaces() {
    const state = await readState();
    return state.workspaces;
  }

  async function forgetWorkspace(id) {
    const state = await readState();
    state.workspaces = state.workspaces.filter(w => w.id !== id);
    if (state.currentId === id) state.currentId = null;
    await writeState(state);
  }

  async function getWorkspaceById(id) {
    const state = await readState();
    return state.workspaces.find(w => w.id === id) || null;
  }

  return {
    pickWorkspace,
    registerWorkspacePath,
    getCurrentWorkspace,
    setCurrentWorkspace,
    listRecentWorkspaces,
    forgetWorkspace,
    getWorkspaceById,
  };
}

function stripBom(raw) {
  return raw && raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
}

function emptyState() {
  return { currentId: null, workspaces: [] };
}

function isValidWorkspace(w) {
  return w
    && typeof w.id === 'string'
    && typeof w.rootPath === 'string'
    && typeof w.name === 'string';
}

function workspaceIdFor(rootPath) {
  return crypto.createHash('sha1').update(rootPath).digest('hex').slice(0, 16);
}

function nameFor(rootPath) {
  return path.basename(rootPath) || rootPath;
}

module.exports = { createWorkspaceService };
