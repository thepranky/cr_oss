import { useCallback, useState } from 'react';
import { setBodyHtml } from '../outlook/body';
import { buildRedline } from '../redline';
import { RedlinePreview } from './RedlinePreview';
import { RichTextField } from './RichTextField';

interface EditorModeProps {
  composeEnabled: boolean;
  onBack: () => void;
}

export function EditorMode({ composeEnabled, onBack }: EditorModeProps) {
  const [originalHtml, setOriginalHtml] = useState('');
  const [currentHtml, setCurrentHtml] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const invalidatePreview = useCallback(() => {
    setPreviewHtml(null);
    setStatusMessage(null);
    setError(null);
  }, []);

  const handleOriginalChange = useCallback(
    (html: string) => {
      setOriginalHtml(html);
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleCurrentChange = useCallback(
    (html: string) => {
      setCurrentHtml(html);
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handlePreview = useCallback(() => {
    setError(null);
    setStatusMessage(null);

    const result = buildRedline(originalHtml, currentHtml, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    if (!result.changed) {
      setPreviewHtml(null);
      setStatusMessage('No changes detected between Original and Current.');
      return;
    }

    setPreviewHtml(result.html);
    setStatusMessage('Redline preview updated.');
  }, [originalHtml, currentHtml]);

  const handleInsert = useCallback(async () => {
    if (!previewHtml) {
      setError('Preview a redline before inserting into the email.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      await setBodyHtml(previewHtml);
      setStatusMessage('Redline inserted into the compose draft.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [previewHtml]);

  return (
    <section className="editor-mode" aria-label="Editor mode">
      <button type="button" className="btn btn--link" onClick={onBack}>
        ← Back to Compose
      </button>

      <p className="editor-mode__intro">
        Paste or type two versions below. Preview the redline locally, then insert it into your
        Outlook draft.
      </p>

      <p
        className="editor-mode__word-tip"
        title="Word paste: when the clipboard includes a .docx payload with Track Changes (w:ins/w:del), revisions import as redlines. Otherwise visible HTML is used. Word OOXML is not available on all platforms."
      >
        Word paste: tries OOXML Track Changes first, then HTML. Not all Word copies include
        revision data.
      </p>

      <RichTextField
        label="Original"
        placeholder="Paste the original text…"
        html={originalHtml}
        onChange={handleOriginalChange}
      />

      <RichTextField
        label="Current"
        placeholder="Paste or edit the revised text…"
        html={currentHtml}
        onChange={handleCurrentChange}
      />

      <div className="controls">
        <button type="button" className="btn btn--primary" onClick={handlePreview}>
          Preview Redline
        </button>
        <button
          type="button"
          className="btn"
          disabled={!previewHtml || !composeEnabled || loading}
          onClick={() => void handleInsert()}
        >
          {loading ? 'Inserting…' : 'Insert into Email'}
        </button>
      </div>

      {!composeEnabled && (
        <p className="controls__hint">Open a compose draft to insert the preview into Outlook.</p>
      )}

      <RedlinePreview html={previewHtml} />

      {statusMessage && <p className="controls__info">{statusMessage}</p>}
      {error && <p className="controls__error">{error}</p>}
    </section>
  );
}
