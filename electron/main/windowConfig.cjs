// Pure helpers for main.cjs BrowserWindow setup. Lives in its own file
// (no `require('electron')`) so unit tests can import it without booting
// an Electron context.

const WINDOW_BOUNDS = Object.freeze({
  width: 1480,
  height: 960,
  minWidth: 1100,
  minHeight: 720,
});

const DEFAULT_DEV_URL = 'http://localhost:5173';

// Decide whether the BrowserWindow should load the Vite dev server or the
// packaged index.html, and whether to open dev tools. Pure: every input
// is passed in.
function resolveLaunchTarget({ argv = [], env = {}, distIndexPath, devUrl } = {}) {
  if (typeof distIndexPath !== 'string' || distIndexPath.length === 0) {
    throw new TypeError('resolveLaunchTarget: distIndexPath is required');
  }
  const isDev =
    (env && env.CITYBASE_DEV === '1') ||
    (Array.isArray(argv) && argv.includes('--dev'));
  if (isDev) {
    return {
      kind: 'dev',
      url: (env && env.CITYBASE_DEV_URL) || devUrl || DEFAULT_DEV_URL,
      openDevTools: true,
    };
  }
  return {
    kind: 'prod',
    file: distIndexPath,
    openDevTools: false,
  };
}

module.exports = { resolveLaunchTarget, WINDOW_BOUNDS, DEFAULT_DEV_URL };
