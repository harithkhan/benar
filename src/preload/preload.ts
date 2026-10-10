import { contextBridge, ipcRenderer } from 'electron';

import { CHANNEL, MENU_COMMANDS, menuEventName, type Bridge, type MenuCommand } from '../shared/bridge';

// The bridge. The renderer gets these six functions and nothing else.
const bridge: Bridge = {
  pickFolder: () => ipcRenderer.invoke(CHANNEL.pickFolder),
  pickWordFile: () => ipcRenderer.invoke(CHANNEL.pickWordFile),
  openTruth: () => ipcRenderer.invoke(CHANNEL.openTruth),
  targetState: (folder, stem) => ipcRenderer.invoke(CHANNEL.targetState, folder, stem),
  saveTruth: (folder, stem, json, replace) => ipcRenderer.invoke(CHANNEL.saveTruth, folder, stem, json, replace),
  setDirty: (dirty) => ipcRenderer.send(CHANNEL.setDirty, dirty),
};

contextBridge.exposeInMainWorld('benar', bridge);

// A command of the File menu comes to the page as a DOM event with no data.
ipcRenderer.on(CHANNEL.menu, (_event, command: unknown) => {
  if (MENU_COMMANDS.includes(command as MenuCommand)) window.dispatchEvent(new Event(menuEventName(command as MenuCommand)));
});
