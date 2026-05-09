const { app, Menu, shell } = require('electron');
const { buildTemplate } = require('./menuTemplate.cjs');

function buildMenu({ getMainWindow }) {
  const sendToRenderer = (channel, payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  const template = buildTemplate({
    isMac: process.platform === 'darwin',
    appName: app.name,
    sendToRenderer,
    openExternal: (url) => shell.openExternal(url),
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu };
