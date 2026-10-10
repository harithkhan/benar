// The save target: `<folder>/<stem>.truth.json`. These functions use text
// only, so that the renderer can use them too. The paths are Mac paths.

const ENDINGS = ['.truth.json', '.docx', '.json'];

/** The name field holds a stem. A typed ending is removed. */
export function cleanStem(name: string): string {
  const stem = name.trim();
  const lower = stem.toLowerCase();
  const ending = ENDINGS.find((candidate) => lower.endsWith(candidate));
  return ending ? stem.slice(0, -ending.length).trim() : stem;
}

/** A stem is one file name: it has no path separator. */
export function isStemValid(stem: string): boolean {
  return stem !== '' && stem !== '.' && stem !== '..' && !/[/\\\0]/.test(stem);
}

function join(folder: string, file: string): string {
  const base = folder.trim().replace(/\/+$/, '');
  return `${base}/${file}`;
}

export function targetPath(folder: string, stem: string): string {
  return join(folder, `${stem}.truth.json`);
}

export function wordPath(folder: string, stem: string): string {
  return join(folder, `${stem}.docx`);
}

/** The folder and the stem of the path of a file. */
export function splitPath(path: string): { folder: string; stem: string } {
  const cut = path.lastIndexOf('/');
  const folder = cut <= 0 ? '/' : path.slice(0, cut);
  return { folder, stem: cleanStem(path.slice(cut + 1)) };
}
