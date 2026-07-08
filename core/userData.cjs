// userData.cjs — platform-correct userData directory for the headless core.
// Resolves to the SAME directory Electron's app.getPath('userData') uses for
// this app ("Citybase"), so both frontends share workspaces.json and
// runs.json: a workspace opened in the Electron shell is already open in the
// Godot app, and run history is one history.
const path = require('node:path');
const os = require('node:os');

function resolveUserDataDir({
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
  appName = 'Citybase',
} = {}) {
  if (platform === 'darwin') {
    return path.join(homedir, 'Library', 'Application Support', appName);
  }
  if (platform === 'win32') {
    return path.join(env.APPDATA || path.join(homedir, 'AppData', 'Roaming'), appName);
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(homedir, '.config'), appName);
}

module.exports = { resolveUserDataDir };
