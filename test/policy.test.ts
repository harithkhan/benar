import { describe, expect, test } from 'vitest';

import { appFilePath, isPermitted } from '../src/main/policy';

// An invented folder. No test here reads or writes a file.
const DIR = '/scratch/app/renderer/main_window';
const file = (url: string) => appFilePath(url, DIR);

describe('the file that a request for app://benar/ gets', () => {
  test('the index page for /', () => {
    expect(file('app://benar/')).toBe(`${DIR}/index.html`);
    expect(file('app://benar/index.html')).toBe(`${DIR}/index.html`);
  });

  test('an asset', () => {
    expect(file('app://benar/assets/index-abc123.js')).toBe(`${DIR}/assets/index-abc123.js`);
    expect(file('app://benar/assets/manrope-latin-wght-normal.woff2')).toBe(`${DIR}/assets/manrope-latin-wght-normal.woff2`);
  });

  test('the query and the fragment are not part of the file', () => {
    expect(file('app://benar/assets/index-abc123.js?v=1#top')).toBe(`${DIR}/assets/index-abc123.js`);
  });

  test('an escape of a permitted character is decoded', () => {
    expect(file('app://benar/assets/a%20b.js')).toBe(`${DIR}/assets/a b.js`);
  });

  // The URL parser removes these `..` parts before the app sees the path. So
  // the file is one of the renderer folder, and not one of the folder above.
  test.each(['app://benar/../package.json', 'app://benar/../../../package.json', 'app://benar/%2e%2e/package.json', 'app://benar/%2E%2E/.%2e/%2e./package.json', 'app://benar/assets/../../package.json'])(
    '%s stays in the renderer folder',
    (url) => {
      expect(file(url)).toBe(`${DIR}/package.json`);
    },
  );

  // The URL parser keeps an escaped slash. The app decodes it, and then the
  // path leaves the folder.
  test.each([
    'app://benar/assets%2F..%2F..%2Fpackage.json',
    'app://benar/assets%2f..%2f..%2fpackage.json',
    'app://benar/assets%2F..%2F..',
    'app://benar/assets/%2e%2e%2f%2e%2e%2fpackage.json',
    'app://benar/..%2Fpackage.json',
    'app://benar/..%2F..%2F..%2F..%2Fetc%2Fpasswd',
  ])('%s gets no file', (url) => {
    expect(file(url)).toBeNull();
  });

  test('the renderer folder itself is no file', () => {
    expect(file('app://benar/assets%2F..')).toBeNull();
    expect(file('app://benar/%2Findex.html%2F..')).toBeNull();
  });

  test('a folder beside the renderer folder, with a name that starts with its name, gets no file', () => {
    expect(file('app://benar/..%2Fmain_window-other%2Findex.html')).toBeNull();
  });

  test('a path with two slashes at its start is a path in the renderer folder, and not a full path', () => {
    expect(file('app://benar//etc/passwd')).toBe(`${DIR}/etc/passwd`);
    expect(file('app://benar/%2Fetc%2Fpasswd')).toBe(`${DIR}/etc/passwd`);
  });

  test('a path with a null character gets no file', () => {
    expect(file('app://benar/index.html%00.js')).toBeNull();
    expect(file('app://benar/%00')).toBeNull();
  });

  // F1: `decodeURIComponent` throws for these. The answer is 404, and not an error.
  test.each(['app://benar/%zz', 'app://benar/%', 'app://benar/assets/%e0%a4%a.js', 'app://benar/%ff'])('the malformed escape of %s gets no file', (url) => {
    expect(() => file(url)).not.toThrow();
    expect(file(url)).toBeNull();
  });

  test('a host in capital letters is another host', () => {
    // `app:` is not one of the special schemes of the URL standard (`http:`,
    // `ws:`, `file:` and so on). For such a scheme the URL parser of Node
    // keeps the case of the host: it does not change it to lower case.
    expect(new URL('app://BENAR/').host).toBe('BENAR');
    expect(new URL('http://BENAR/').host).toBe('benar');
    expect(file('app://BENAR/')).toBeNull();
    expect(file('app://Benar/index.html')).toBeNull();
  });

  test.each(['app://benar.evil/', 'app://benar.evil/index.html', 'app://evil.benar/', 'app://other/index.html', 'app://benar:80/index.html', 'app://benar@other/index.html', 'app:///index.html', 'app:/index.html', 'app:index.html'])(
    'another host gets no file: %s',
    (url) => {
      expect(file(url)).toBeNull();
    },
  );

  test.each(['http://benar/index.html', 'https://benar/index.html', 'file://benar/index.html', 'file:///index.html', 'ws://benar/', 'data:text/html,benar', 'blob:app://benar/index.html'])(
    'another scheme gets no file: %s',
    (url) => {
      expect(file(url)).toBeNull();
    },
  );

  test.each(['', 'benar', '/index.html', 'app://'])('a text that is not a URL gets no file: %j', (url) => {
    expect(file(url)).toBeNull();
  });
});

describe('the request block of the packaged app', () => {
  const permitted = (url: string) => isPermitted(url, undefined);

  test.each(['app://benar/', 'app://benar/index.html', 'app://benar/assets/index-abc123.js', 'app://benar/assets/index-abc123.js?v=1'])('%s is permitted', (url) => {
    expect(permitted(url)).toBe(true);
  });

  test.each([
    'https://example.com/',
    'http://example.com/',
    'ws://example.com/',
    'wss://example.com/',
    'file:///etc/passwd',
    'data:text/html,x',
    'blob:app://benar/0b1f3a2e',
    'devtools://devtools/bundled/inspector.html',
    'app://other/',
    'app://other/index.html',
  ])('%s is not permitted', (url) => {
    expect(permitted(url)).toBe(false);
  });

  test.each(['http://benar/', 'https://benar/', 'ws://benar/', 'file://benar/index.html'])('the host of the app with another scheme is not permitted: %s', (url) => {
    expect(permitted(url)).toBe(false);
  });

  test.each(['app://BENAR/', 'app://benar.evil/', 'app://evil.benar/', 'app://benar:80/', 'app://benar@other/', 'app:///index.html', 'app:benar/index.html'])('another host of the scheme of the app is not permitted: %s', (url) => {
    expect(permitted(url)).toBe(false);
  });

  test.each(['http://localhost:5173/', 'ws://localhost:5173/', 'http://127.0.0.1:5173/'])('the dev server is not permitted: %s', (url) => {
    expect(permitted(url)).toBe(false);
  });

  test('an empty dev URL is no dev URL', () => {
    expect(isPermitted('http://localhost:5173/', '')).toBe(false);
    expect(isPermitted('devtools://devtools/bundled/inspector.html', '')).toBe(false);
    expect(isPermitted('app://benar/index.html', '')).toBe(true);
  });

  test.each(['', 'benar', '/index.html', 'http://'])('a text that is not a URL is not permitted: %j', (url) => {
    expect(permitted(url)).toBe(false);
  });
});

describe('the request block in pnpm start', () => {
  const DEV = 'http://localhost:5173';
  const permitted = (url: string) => isPermitted(url, DEV);

  test.each(['http://localhost:5173/', 'http://localhost:5173/src/renderer/main.tsx', 'http://localhost:5173/@vite/client', 'ws://localhost:5173/', 'ws://localhost:5173/?token=abc'])('the dev server is permitted: %s', (url) => {
    expect(permitted(url)).toBe(true);
  });

  test('the files of the app are permitted', () => {
    expect(permitted('app://benar/index.html')).toBe(true);
  });

  // What the code permits today in `pnpm start`: each `devtools:` address.
  test('the developer tools are permitted', () => {
    expect(permitted('devtools://devtools/bundled/inspector.html')).toBe(true);
  });

  test.each(['https://localhost:5173/', 'wss://localhost:5173/', 'ftp://localhost:5173/', 'app://localhost:5173/'])('the host of the dev server with another scheme is not permitted: %s', (url) => {
    expect(permitted(url)).toBe(false);
  });

  test.each(['http://localhost:5174/', 'http://localhost:51730/', 'http://localhost/', 'http://localhost:80/', 'ws://localhost:5174/', 'ws://localhost/'])('another port is not permitted: %s', (url) => {
    expect(permitted(url)).toBe(false);
  });

  test.each([
    'http://127.0.0.1:5173/',
    'http://[::1]:5173/',
    'http://example.com:5173/',
    'http://example.com/',
    'ws://example.com:5173/',
    'http://localhost.example.com:5173/',
    'http://localhost.:5173/',
    // `localhost:5173` is the user name and the password here. The host is `example.com`.
    'http://localhost:5173@example.com/',
    'http://example.com/?http://localhost:5173/',
    'http://example.com/#localhost:5173',
    // This text is not a URL: a port has digits only.
    'http://localhost:5173.example.com/',
  ])('another host is not permitted: %s', (url) => {
    expect(permitted(url)).toBe(false);
  });

  test.each(['https://example.com/', 'wss://example.com/', 'file:///etc/passwd', 'data:text/html,x', 'blob:http://localhost:5173/0b1f3a2e', 'app://other/'])('%s is not permitted', (url) => {
    expect(permitted(url)).toBe(false);
  });

  test('a dev URL with a slash at its end, or with a path, permits the same host', () => {
    expect(isPermitted('http://localhost:5173/@vite/client', 'http://localhost:5173/')).toBe(true);
    expect(isPermitted('http://localhost:5174/@vite/client', 'http://localhost:5173/')).toBe(false);
  });
});
