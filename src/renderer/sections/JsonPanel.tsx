/** A closed panel with the output text. The text is read-only. */
export function JsonPanel({ json }: { json: string }) {
  return (
    <details className="rounded-card border border-line bg-panel">
      <summary className="cursor-pointer rounded-card px-4 py-3.5 text-h2">Show the JSON</summary>
      <pre tabIndex={0} aria-label="The JSON that Save writes" className="max-h-[440px] overflow-auto rounded-b-card border-t border-line bg-field p-4 font-mono text-xs leading-relaxed text-ink-muted select-text">
        {json}
      </pre>
    </details>
  );
}
