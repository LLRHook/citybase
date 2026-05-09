import { describe, expect, it, vi } from 'vitest';
import { buildTemplate } from '../../electron/main/menuTemplate.cjs';

function findItem(template, predicate) {
  for (const top of template) {
    if (!Array.isArray(top.submenu)) continue;
    for (const item of top.submenu) {
      if (predicate(item, top)) return { item, parent: top };
    }
  }
  return null;
}

function buildWith(overrides = {}) {
  const sendToRenderer = vi.fn();
  const openExternal = vi.fn();
  const template = buildTemplate({
    isMac: false,
    appName: 'Citybase',
    sendToRenderer,
    openExternal,
    ...overrides,
  });
  return { template, sendToRenderer, openExternal };
}

describe('buildTemplate (menu)', () => {
  it('returns a top-level structure with File, View, Window, and Help menus on every platform', () => {
    const { template } = buildWith({ isMac: false });
    const labels = template.map(t => t.label || t.role);
    expect(labels).toEqual(expect.arrayContaining(['File', 'View', 'window', 'help']));
  });

  it('prepends a macOS app menu only when isMac is true', () => {
    const { template: macTpl } = buildWith({ isMac: true, appName: 'Citybase' });
    expect(macTpl[0].label).toBe('Citybase');

    const { template: linuxTpl } = buildWith({ isMac: false });
    expect(linuxTpl[0].label).not.toBe('Citybase');
  });

  it('places the Settings… item under the macOS app menu and not under File', () => {
    const { template } = buildWith({ isMac: true, appName: 'Citybase' });
    const inApp = template[0].submenu.find(it => it.label === 'Settings…');
    expect(inApp).toBeDefined();
    expect(inApp.accelerator).toBe('CmdOrCtrl+,');

    const file = template.find(t => t.label === 'File');
    const inFile = file.submenu.find(it => it.label === 'Settings…');
    expect(inFile).toBeUndefined();
  });

  it('places the Settings… item under the File menu on non-macOS platforms', () => {
    const { template } = buildWith({ isMac: false });
    const file = template.find(t => t.label === 'File');
    const inFile = file.submenu.find(it => it.label === 'Settings…');
    expect(inFile).toBeDefined();
    expect(inFile.accelerator).toBe('CmdOrCtrl+,');
  });

  it('emits openSettings on the citybase:menu channel when Settings is clicked', () => {
    const { template, sendToRenderer } = buildWith({ isMac: false });
    const { item } = findItem(template, it => it.label === 'Settings…');
    item.click();
    expect(sendToRenderer).toHaveBeenCalledWith('citybase:menu', { action: 'openSettings' });
  });

  it('exposes Open Workspace and Close Workspace under File on every platform', () => {
    const { template, sendToRenderer } = buildWith({ isMac: true, appName: 'Citybase' });
    const file = template.find(t => t.label === 'File');
    const open = file.submenu.find(it => it.label === 'Open Workspace…');
    const close = file.submenu.find(it => it.label === 'Close Workspace');
    expect(open).toBeDefined();
    expect(close).toBeDefined();
    expect(open.accelerator).toBe('CmdOrCtrl+O');
    expect(close.accelerator).toBe('CmdOrCtrl+Shift+W');

    open.click();
    close.click();
    expect(sendToRenderer).toHaveBeenNthCalledWith(1, 'citybase:menu', { action: 'openWorkspace' });
    expect(sendToRenderer).toHaveBeenNthCalledWith(2, 'citybase:menu', { action: 'closeWorkspace' });
  });

  it('routes the Help → About Citybase item through openExternal to the canonical repo URL', () => {
    const { template, openExternal } = buildWith({ isMac: false });
    const help = template.find(t => t.role === 'help');
    const about = help.submenu.find(it => it.label === 'About Citybase');
    expect(about).toBeDefined();
    about.click();
    expect(openExternal).toHaveBeenCalledWith('https://github.com/LLRHook/citybase');
  });

  it('exposes Quit / close in the right place per platform', () => {
    const { template: macTpl } = buildWith({ isMac: true, appName: 'Citybase' });
    const macFile = macTpl.find(t => t.label === 'File');
    expect(macFile.submenu.some(it => it.role === 'close')).toBe(true);
    expect(macTpl[0].submenu.some(it => it.role === 'quit')).toBe(true);

    const { template: linuxTpl } = buildWith({ isMac: false });
    const linuxFile = linuxTpl.find(t => t.label === 'File');
    expect(linuxFile.submenu.some(it => it.role === 'quit')).toBe(true);
  });
});
