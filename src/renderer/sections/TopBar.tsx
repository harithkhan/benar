import { Button } from '../components/ui';

interface Props {
  /** The name of the file that the user picked in an open, or of the file of the last save, with its ending. `null` for a new file. */
  fileName: string | null;
  dirty: boolean;
  /** The three commands are not given while they are not available: a save is in progress. */
  onNew?: () => void;
  onOpen?: () => void;
  onNewFromMatter?: () => void;
}

export function TopBar({ fileName, dirty, onNew, onOpen, onNewFromMatter }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
      <span className="text-h1">Benar</span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-muted">
        {fileName === null ? 'New file' : <span className="truncate font-mono text-xs text-accent-text">{fileName}</span>}
        {dirty && <span role="img" aria-label="Unsaved changes" title="Unsaved changes" className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
      </span>
      <Button compact onClick={onNew} disabled={!onNew}>
        New
      </Button>
      <Button compact onClick={onOpen} disabled={!onOpen}>
        Open…
      </Button>
      <Button compact onClick={onNewFromMatter} disabled={!onNewFromMatter}>
        New from same matter…
      </Button>
    </header>
  );
}
