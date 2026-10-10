import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { app, BrowserWindow, protocol, session } from 'electron';

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
  // The window opens no other window and goes to no other page.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  void window.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
}

void app.whenReady().then(() => {
  serveAppFiles();
  blockRequests();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
