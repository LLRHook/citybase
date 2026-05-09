// workspaceService.cjs — picks a local folder, persists it, lists recent ones.
// Storage: a single JSON file in app.getPath('userData')/workspaces.json.
// Serializable shape returned to the renderer matches plan.md → type Workspace.
const { app, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const STATE_FILENAME = 'workspaces.json';
const MAX_RECENT = 12;

function statePath() {
  return path.join(app.getPath('userData'), STATE_FILENAME);
}

async function readState() {
  try {
    const raw = await fs.readFile(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
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

function emptyState() {
  return { currentId: null, workspaces: [] };
}

function isValidWorkspace(w) {
  return w
    && typeof w.id === 'string'
    && typeof w.rootPath === 'string'
    && typeof w.name === 'string';
}

async function writeState(state) {
  const file = statePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), 'utf8');
}

function workspaceIdFor(rootPath) {
  return crypto.createHash('sha1').update(rootPath).digest('hex').slice(0, 16);
}

function nameFor(rootPath) {
  return path.basename(rootPath) || rootPath;
}

async function rememberWorkspace(rootPath) {
  const real = await fs.realpath(rootPath);
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) {
    throw new Error(`not a directory: ${real}`);
  }
  const state = await readState();
  const id = workspaceIdFor(real);
  const now = new Date().toISOString();
  const existing = state.workspaces.find(w => w.id === id);
  const ws = {
    id,
    name: nameFor(real),
    rootPath: real,
    openedAt: existing ? existing.openedAt : now,
    lastOpenedAt: now,
  };
  const others = state.workspaces.filter(w => w.id !== id);
  state.workspaces = [ws, ...others].slice(0, MAX_RECENT);
  state.currentId = id;
  await writeState(state);
  return ws;
}

async function pickWorkspace({ window } = {}) {
  const result = await dialog.showOpenDialog(window || undefined, {
    title: 'Open Workspace',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return rememberWorkspace(result.filePaths[0]);
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
  found.lastOpenedAt = new Date().toISOString();
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

module.exports = {
  pickWorkspace,
  getCurrentWorkspace,
  setCurrentWorkspace,
  listRecentWorkspaces,
  forgetWorkspace,
  getWorkspaceById,
};
