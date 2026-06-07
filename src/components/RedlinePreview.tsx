interface RedlinePreviewProps {
  html: string | null;
  emptyMessage?: string;
}

export function RedlinePreview({
  html,
  emptyMessage = 'Preview will appear here after you click Preview Redline.',
}: RedlinePreviewProps) {
  if (!html) {
    return (
      <section className="redline-preview redline-preview--empty" aria-label="Redline preview">
        <p>{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="redline-preview" aria-label="Redline preview">
      <p className="redline-preview__label">Preview</p>
      <div className="redline-preview__content" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
