// Pure menu template builder. Lives in its own file (no `require('electron')`)
// so unit tests can import it without booting an Electron context.
// menu.cjs glues this to Menu.setApplicationMenu / app.name / shell.openExternal.

function buildTemplate({ isMac, appName, sendToRenderer, openExternal }) {
  const settingsItem = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: () => sendToRenderer('citybase:menu', { action: 'openSettings' }),
  };

  return [
    ...(isMac ? [{
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        settingsItem,
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Workspace…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToRenderer('citybase:menu', { action: 'openWorkspace' }),
        },
        {
          label: 'Close Workspace',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => sendToRenderer('citybase:menu', { action: 'closeWorkspace' }),
        },
        // On macOS Settings lives under the app menu by convention; on other
        // platforms the File menu is the expected home.
        ...(isMac ? [] : [
          { type: 'separator' },
          settingsItem,
        ]),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : []),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'About Citybase',
          click: () => openExternal('https://github.com/LLRHook/citybase'),
        },
      ],
    },
  ];
}

module.exports = { buildTemplate };
