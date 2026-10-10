import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, protocol, session, systemPreferences, type IpcMainInvokeEvent, type OpenDialogOptions, type Session } from 'electron';

import { CHANNEL } from '../shared/bridge';
import { splitPath } from '../shared/target';
import { pickedTruth, saveTruth, targetState } from './files';
import { installMenu } from './menu';
import { appFilePath, isFromApp, isPermitted } from './policy';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// The pages of the app come from `app://benar/`. The scheme is standard and
// secure, so that 'self' in the content policy means the app's own files.
const APP_ORIGIN = 'app://benar';
const DEV_URL = MAIN_WINDOW_VITE_DEV_SERVER_URL;
const RENDERER_DIR = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);

// A partition with no `persist:` prefix is a session in memory only. So the
// session keeps no cache and no storage on the disk.
const PARTITION = 'benar';

const POLICY = "default-src 'self'";
// `pnpm start` only: the Vite dev server adds its styles and its refresh
// script inline, and it holds a socket for hot reload.
const DEV_POLICY = "default-src 'self' 'unsafe-inline'; connect-src 'self' ws:";

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }]);

function serveAppFiles(appSession: Session): void {
  appSession.protocol.handle('app', async (request) => {
    // A request that is not for a file of the renderer folder gets no file.
    const file = appFilePath(request.url, RENDERER_DIR);
    if (file === null) return new Response(null, { status: 404 });
    try {
      const body = await readFile(file);
      return new Response(new Uint8Array(body), {
        headers: {
          'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
          'content-security-policy': POLICY,
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

// No network: the session cancels each request that `isPermitted` refuses.
function blockRequests(appSession: Session): void {
  appSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isPermitted(details.url, DEV_URL) });
  });
  if (DEV_URL) {
    appSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [DEV_POLICY] } });
    });
  }
  appSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  appSession.setPermissionCheckHandler(() => false);
  // The app has no spell check: a spell check can download a dictionary.
  appSession.setSpellCheckerEnabled(false);
}

let mainWindow: BrowserWindow | null = null;
/** The renderer says when the form has unsaved changes. */
let dirty = false;
/**
 * The number of dialogs of the main process that are open: a file dialog, or
 * the question before a close. A dialog is a sheet on the window, and the File
 * menu stays active above it. So while the count is above zero, the menu sends
 * no command and no second file dialog opens.
 */
let openDialogs = 0;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#1B1E24',
    title: 'Benar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      partition: PARTITION,
      spellcheck: false,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = window;
  dirty = false;
  // The window opens no other window and goes to no other page.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  // The main process asks before the window closes with unsaved changes.
  window.on('close', (event) => {
    if (!dirty) return;
    openDialogs += 1;
    let choice: number;
    try {
      choice = dialog.showMessageBoxSync(window, {
        type: 'warning',
        message: 'The form has unsaved changes.',
        detail: 'If you close the window, the changes are lost.',
        buttons: ['Cancel', 'Close and lose the changes'],
        defaultId: 0,
        cancelId: 0,
      });
    } finally {
      openDialogs -= 1;
    }
    if (choice === 0) event.preventDefault();
  });
  window.on('closed', () => {
    mainWindow = null;
  });
  void window.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
}

// A call is served only when it comes from the page of the app.
function fromApp(event: IpcMainInvokeEvent): boolean {
  return isFromApp(event.senderFrame?.url ?? '', DEV_URL);
}

const isText = (value: unknown): value is string => typeof value === 'string';

// macOS keeps the last folder of a file dialog in the preferences of the app.
// The path of a folder can hold a client name, so the app removes these keys.
const DIALOG_FOLDER_KEYS = ['NSNavLastRootDirectory', 'NSOSPLastRootDirectory'];
/** The folder of the last pick. In memory only: the next dialog starts there. */
let lastFolder: string | undefined;

function forgetDialogFolder(): void {
  for (const key of DIALOG_FOLDER_KEYS) systemPreferences.removeUserDefault(key);
}

/** A Mac file dialog. It gives the picked path, or `null`. One dialog at a time: a call while one is open gives `null`. */
async function pick(window: BrowserWindow, options: OpenDialogOptions): Promise<string | null> {
  if (openDialogs > 0) return null;
  openDialogs += 1;
  try {
    const result = await dialog.showOpenDialog(window, lastFolder === undefined ? options : { ...options, defaultPath: lastFolder });
    forgetDialogFolder();
    const picked = result.canceled ? null : (result.filePaths[0] ?? null);
    if (picked !== null) lastFolder = options.properties?.includes('openDirectory') ? picked : path.dirname(picked);
    return picked;
  } finally {
    openDialogs -= 1;
  }
}

function serveBridge(): void {
  ipcMain.handle(CHANNEL.pickFolder, async (event) => {
    if (!fromApp(event) || !mainWindow) return null;
    return pick(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  });

  // The path only: the app does not open the Word file.
  ipcMain.handle(CHANNEL.pickWordFile, async (event) => {
    if (!fromApp(event) || !mainWindow) return null;
    const file = await pick(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Word documents', extensions: ['docx'] }],
    });
    return file === null ? null : splitPath(file);
  });

  ipcMain.handle(CHANNEL.openTruth, async (event) => {
    if (!fromApp(event) || !mainWindow) return null;
    const file = await pick(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Ground-truth files', extensions: ['json'] }],
    });
    return file === null ? null : pickedTruth(file);
  });

  ipcMain.handle(CHANNEL.targetState, async (event, folder: unknown, stem: unknown) => {
    if (!fromApp(event) || !isText(folder) || !isText(stem)) return { folderExists: false, truthExists: false, wordFileExists: false };
    return targetState(folder, stem);
  });

  ipcMain.handle(CHANNEL.saveTruth, async (event, folder: unknown, stem: unknown, json: unknown, replace: unknown) => {
    if (!fromApp(event) || !isText(folder) || !isText(stem) || !isText(json)) return { ok: false, reason: 'failed' };
    return saveTruth(folder, stem, json, replace === true);
  });

  ipcMain.on(CHANNEL.setDirty, (event, value: unknown) => {
    if (event.sender === mainWindow?.webContents) dirty = value === true;
  });
}

void app.whenReady().then(() => {
  forgetDialogFolder(); // An earlier run or a crash can leave an entry.
  // The window uses this session only. The default session gets no request, and it permits none.
  session.defaultSession.webRequest.onBeforeRequest((_details, callback) => callback({ cancel: true }));
  const appSession = session.fromPartition(PARTITION);
  serveAppFiles(appSession);
  blockRequests(appSession);
  serveBridge();
  // A command of the File menu goes to no window while a dialog of the main process is open.
  installMenu(() => (openDialogs > 0 ? null : mainWindow));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', forgetDialogFolder);
