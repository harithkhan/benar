import path from 'node:path';

// The rules of the main process for a request: which request is permitted,
// which file a request for `app://benar/` gets, and which page can call the
// bridge. These functions use text only. The file has no import of Electron,
// so that a test can run it.

/**
 * The file of the renderer folder that a request for `app://benar/...` gets.
 * `null` when the request gets no file: the answer is 404.
 */
export function appFilePath(requestUrl: string, rendererDir: string): string | null {
  let relative: string;
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== 'app:' || url.host !== 'benar') return null;
    // A malformed escape, for example `%zz`, is an error here.
    relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  } catch {
    return null;
  }
  // No file name has a null character.
  if (relative.includes('\0')) return null;
  const file = path.join(rendererDir, relative);
  // A path that leaves the folder of the renderer gets no file.
  if (!file.startsWith(rendererDir + path.sep)) return null;
  return file;
}

/**
 * No network: the session cancels each request that is not for the app's own
 * files. In `pnpm start` the Vite dev server is permitted too. `devUrl` is the
 * address of that server, and `undefined` in the packaged app.
 */
export function isPermitted(requestUrl: string, devUrl: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return false;
  }
  if (url.protocol === 'app:' && url.host === 'benar') return true;
  if (devUrl) {
    if (url.protocol === 'devtools:') return true;
    const dev = new URL(devUrl);
    if (url.host === dev.host && (url.protocol === 'http:' || url.protocol === 'ws:')) return true;
  }
  return false;
}

/**
 * A call of the bridge is served only when it comes from the page of the app:
 * a page of `app://benar/`, and in `pnpm start` a page of the origin of the
 * dev server. `senderUrl` is the address of the frame that made the call.
 */
export function isFromApp(senderUrl: string, devUrl: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(senderUrl);
  } catch {
    return false;
  }
  if (url.protocol === 'app:' && url.host === 'benar') return true;
  if (devUrl) {
    // The origin: the scheme, the host and the port. The path of the dev URL does not count.
    const dev = new URL(devUrl);
    if (url.protocol === dev.protocol && url.host === dev.host) return true;
  }
  return false;
}
