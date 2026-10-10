import { Button } from '../components/ui';

interface Props {
  /** The stem of the file that the form opened or saved, or `null` for a new file. */
  fileName: string | null;
  dirty: boolean;
  onNew?: () => void;
  onOpen?: () => void;
  onNewFromMatter?: () => void;
}

export function TopBar({ fileName, dirty, onNew, onOpen, onNewFromMatter }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
      <span className="text-h1">Benar</span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-muted">
        {fileName === null ? 'New file' : <span className="truncate font-mono text-xs text-accent-text">{fileName}.truth.json</span>}
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
