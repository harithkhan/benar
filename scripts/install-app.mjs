// Copies the app that `pnpm package` built to /Applications/Benar.app.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const built = path.join(root, 'out', `Benar-darwin-${process.arch}`, 'Benar.app');
const target = '/Applications/Benar.app';

if (process.platform !== 'darwin') {
  console.error('This script is for a Mac only.');
  process.exit(1);
}
if (!existsSync(built)) {
  console.error(`No built app is at ${built}. Run "pnpm package" first.`);
  process.exit(1);
}

// `ditto` keeps the links and the attributes of an app bundle.
rmSync(target, { recursive: true, force: true });
execFileSync('ditto', [built, target], { stdio: 'inherit' });
console.log(`Installed ${target}`);
console.log('If the app does not open, sign it ad hoc: codesign --force --deep --sign - /Applications/Benar.app');
