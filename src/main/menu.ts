import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

import { CHANNEL, type MenuCommand } from '../shared/bridge';

// The File menu, and the standard Edit and Window menus. `window` gives the
// window that a command goes to, or `null` when the command goes nowhere.
export function installMenu(window: () => BrowserWindow | null): void {
  const send = (command: MenuCommand) => () => window()?.webContents.send(CHANNEL.menu, command);
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'Cmd+N', click: send('new') },
        { label: 'Open…', accelerator: 'Cmd+O', click: send('open') },
        { label: 'New from a file of the same matter…', accelerator: 'Shift+Cmd+N', click: send('new-from-matter') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'Cmd+S', click: send('save') },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
