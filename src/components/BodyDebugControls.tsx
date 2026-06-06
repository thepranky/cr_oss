import { useOutlookBody } from '../hooks/useOutlookBody';

const TEST_HTML = '<p>Hello <b>world</b></p>';

interface BodyDebugControlsProps {
  disabled?: boolean;
}

function previewBody(content: string, maxLength = 200): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength)}…`;
}

export function BodyDebugControls({ disabled = false }: BodyDebugControlsProps) {
  const { loading, error, lastRead, readBody, writeBody } = useOutlookBody();
  const busy = loading || disabled;

  return (
    <section className="debug-controls" aria-label="Body read/write debug controls">
      <p className="debug-controls__label">Debug — compose body (Stage 2)</p>
      <div className="controls">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void readBody('text')}
        >
          Read Body
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void writeBody(TEST_HTML, 'html')}
        >
          Write Test HTML
        </button>
      </div>
      {loading && <p className="debug-controls__status">Working…</p>}
      {error && <p className="debug-controls__error">{error}</p>}
      {lastRead !== null && !loading && (
        <p className="debug-controls__preview">
          Last read ({lastRead.length} chars): <code>{previewBody(lastRead)}</code>
        </p>
      )}
    </section>
  );
}
