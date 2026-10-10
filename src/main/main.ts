import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, protocol, session, type IpcMainInvokeEvent } from 'electron';

import { CHANNEL } from '../shared/bridge';
import { splitPath } from '../shared/target';
import { readTruth, saveTruth, targetState } from './files';
import { installMenu } from './menu';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// The pages of the app come from `app://benar/`. The scheme is standard and
// secure, so that 'self' in the content policy means the app's own files.
const APP_ORIGIN = 'app://benar';
const DEV_URL = MAIN_WINDOW_VITE_DEV_SERVER_URL;
const RENDERER_DIR = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);

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

function serveAppFiles(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'benar') return new Response(null, { status: 404 });
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(RENDERER_DIR, relative);
    // A path that leaves the folder of the renderer gets no file.
    if (!file.startsWith(RENDERER_DIR + path.sep)) return new Response(null, { status: 404 });
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

// No network: the session cancels each request that is not for the app's own
// files. In `pnpm start` the Vite dev server is permitted too.
function isPermitted(requestUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return false;
  }
  if (url.protocol === 'app:' && url.host === 'benar') return true;
  if (DEV_URL) {
    if (url.protocol === 'devtools:') return true;
    const dev = new URL(DEV_URL);
    if (url.host === dev.host && (url.protocol === 'http:' || url.protocol === 'ws:')) return true;
  }
  return false;
}

function blockRequests(): void {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isPermitted(details.url) });
  });
  if (DEV_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [DEV_POLICY] } });
    });
  }
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}

let mainWindow: BrowserWindow | null = null;
/** The renderer says when the form has unsaved changes. */
let dirty = false;

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
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: 'The form has unsaved changes.',
      detail: 'If you close the window, the changes are lost.',
      buttons: ['Cancel', 'Close and lose the changes'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 0) event.preventDefault();
  });
  window.on('closed', () => {
    mainWindow = null;
  });
  void window.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
}

// A call is served only when it comes from the page of the app.
function fromApp(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith(`${APP_ORIGIN}/`) || (DEV_URL !== undefined && url.startsWith(DEV_URL));
}

const isText = (value: unknown): value is string => typeof value === 'string';

function serveBridge(): void {
  ipcMain.handle(CHANNEL.pickFolder, async (event) => {
    if (!fromApp(event) || !mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // The path only: the app does not open the Word file.
  ipcMain.handle(CHANNEL.pickWordFile, async (event) => {
    if (!fromApp(event) || !mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Word documents', extensions: ['docx'] }],
    });
    const file = result.filePaths[0];
    return result.canceled || !file ? null : splitPath(file);
  });

  ipcMain.handle(CHANNEL.openTruth, async (event) => {
    if (!fromApp(event) || !mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Ground-truth files', extensions: ['json'] }],
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    return (await readTruth(file)) ?? { ...splitPath(file), json: null };
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
  serveAppFiles();
  blockRequests();
  serveBridge();
  installMenu(() => mainWindow);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
