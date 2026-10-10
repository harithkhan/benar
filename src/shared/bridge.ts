// The functions that the preload gives the renderer, and the names of the
// channels between the processes.

export interface TargetState {
  folderExists: boolean;
  truthExists: boolean;
  wordFileExists: boolean;
}

export type SaveResult = { ok: true } | { ok: false; reason: 'exists' | 'bad-name' | 'no-folder' | 'failed' };

/** The file that the user picked in the dialog of `openTruth`. */
export interface PickedTruth {
  folder: string;
  stem: string;
  /** `true` only when a save of this folder and stem writes the picked file. */
  sameFile: boolean;
  /** `null` when the app cannot read the file. */
  json: string | null;
}

export interface Bridge {
  /** The Mac folder dialog. */
  pickFolder(): Promise<string | null>;
  /** The Mac file dialog for a Word file. It gives the path only. */
  pickWordFile(): Promise<{ folder: string; stem: string } | null>;
  /** The Mac file dialog for a ground-truth file. */
  openTruth(): Promise<PickedTruth | null>;
  targetState(folder: string, stem: string): Promise<TargetState>;
  saveTruth(folder: string, stem: string, json: string, replace: boolean): Promise<SaveResult>;
  setDirty(dirty: boolean): void;
}

export const CHANNEL = {
  pickFolder: 'benar:pick-folder',
  pickWordFile: 'benar:pick-word-file',
  openTruth: 'benar:open-truth',
  targetState: 'benar:target-state',
  saveTruth: 'benar:save-truth',
  setDirty: 'benar:set-dirty',
  menu: 'benar:menu',
} as const;

/** A command of the File menu. The preload gives it to the page as a DOM event. */
export const MENU_COMMANDS = ['new', 'open', 'new-from-matter', 'save'] as const;
export type MenuCommand = (typeof MENU_COMMANDS)[number];
export const menuEventName = (command: MenuCommand): string => `benar-menu-${command}`;
