export function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
        <span className="text-h1">Benar</span>
        <span className="text-sm text-ink-muted">New file</span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto" />
    </div>
  );
}
