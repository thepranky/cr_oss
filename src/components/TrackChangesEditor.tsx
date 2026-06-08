import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  buildEditorRedline,
  decorateEditorRedlineHtml,
  extractCleanEditorHtml,
  snapshotEditorBaseline,
} from '../redline/editorRedline';
import { buildPlainTextMap } from '../redline/htmlPlainMap';
import { pasteContentFromClipboard } from '../redline/sanitizeWordHtml';
import { copyHtmlToClipboard } from '../utils/copyHtml';
import { getCaretCleanOffset, setCaretCleanOffset } from './editorCaret';
import { tryExpandListShortcut, tryHandleListEnter } from './editorListShortcuts';

interface TrackChangesEditorProps {
  composeEnabled: boolean;
  bringingToEditor?: boolean;
  onBringToEditor?: () => Promise<void>;
  onClearRegion: () => void;
  initialHtml?: string;
}

type EditorNotice = {
  text: string;
  tone: 'error' | 'info';
};

function unwrapRedlineDiv(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<div>([\s\S]*)<\/div>$/i);
  return match ? match[1] : trimmed;
}

function CopyIcon() {
  return (
    <svg
      className="track-editor__copy-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M4 11V4.5C4 3.67 4.67 3 5.5 3H11"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function createEditorState(initialHtml: string) {
  const snapshot = initialHtml.trim() ? snapshotEditorBaseline(initialHtml) : '';
  const hasInitial = snapshot.length > 0;

  return {
    baselineSnapshot: hasInitial ? snapshot : null,
    cleanHtml: snapshot,
    tracking: hasInitial,
    hasContent: hasInitial,
  };
}

export function TrackChangesEditor({
  composeEnabled,
  bringingToEditor = false,
  onBringToEditor,
  onClearRegion,
  initialHtml = '',
}: TrackChangesEditorProps) {
  const initialState = createEditorState(initialHtml);
  const editorRef = useRef<HTMLDivElement>(null);
  const baselineSnapshotRef = useRef<string | null>(initialState.baselineSnapshot);
  const cleanHtmlRef = useRef(initialState.cleanHtml);
  const lastCleanPlainRef = useRef(initialState.cleanHtml ? buildPlainTextMap(initialState.cleanHtml).text : '');
  const trackingRef = useRef(initialState.tracking);
  const renderFrameRef = useRef<number | null>(null);
  const renderTimeoutRef = useRef<number | null>(null);
  const lastRenderAtRef = useRef(0);
  const skipSyncRef = useRef(false);

  const TRACK_RENDER_MIN_MS = 32;

  const [tracking, setTracking] = useState(initialState.tracking);
  const [hasContent, setHasContent] = useState(initialState.hasContent);
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState<EditorNotice | null>(null);

  const showNotice = useCallback((text: string, tone: EditorNotice['tone'] = 'info') => {
    setNotice({ text, tone });
  }, []);

  const clearNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const syncEditorHtml = useCallback((html: string, caretOffset?: number | null) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    skipSyncRef.current = true;
    editor.innerHTML = html;
    if (caretOffset !== undefined && caretOffset !== null) {
      setCaretCleanOffset(editor, caretOffset);
    }
    skipSyncRef.current = false;
    setHasContent(extractCleanEditorHtml(html).trim().length > 0);
  }, []);

  const renderTrackedHtml = useCallback(
    (cleanHtml: string, caretOffset?: number | null) => {
      const baseline = baselineSnapshotRef.current;
      if (!baseline || !trackingRef.current) {
        syncEditorHtml(cleanHtml, caretOffset);
        return;
      }

      const result = buildEditorRedline(baseline, cleanHtml);
      if (!result.changed) {
        syncEditorHtml(cleanHtml, caretOffset);
        return;
      }

      const display = decorateEditorRedlineHtml(unwrapRedlineDiv(result.html));
      syncEditorHtml(display, caretOffset);
    },
    [syncEditorHtml],
  );

  const flushTrackedRender = useCallback(() => {
    if (renderFrameRef.current !== null) {
      window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
    }
    if (renderTimeoutRef.current !== null) {
      window.clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = null;
    }

    const editor = editorRef.current;
    const caret = editor ? getCaretCleanOffset(editor) : null;
    renderTrackedHtml(cleanHtmlRef.current, caret);
    lastCleanPlainRef.current = buildPlainTextMap(cleanHtmlRef.current).text;
    lastRenderAtRef.current = performance.now();
  }, [renderTrackedHtml]);

  const scheduleTrackedRender = useCallback(
    (cleanHtml: string) => {
      cleanHtmlRef.current = cleanHtml;

      const run = () => {
        renderFrameRef.current = null;
        renderTimeoutRef.current = null;
        flushTrackedRender();
      };

      if (renderFrameRef.current !== null) {
        window.cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
      if (renderTimeoutRef.current !== null) {
        window.clearTimeout(renderTimeoutRef.current);
        renderTimeoutRef.current = null;
      }

      const elapsed = performance.now() - lastRenderAtRef.current;
      if (elapsed >= TRACK_RENDER_MIN_MS) {
        renderFrameRef.current = window.requestAnimationFrame(run);
        return;
      }

      renderTimeoutRef.current = window.setTimeout(
        () => {
          renderFrameRef.current = window.requestAnimationFrame(run);
        },
        TRACK_RENDER_MIN_MS - elapsed,
      );
    },
    [flushTrackedRender],
  );

  const establishBaseline = useCallback((sourceHtml: string) => {
    const snapshot = snapshotEditorBaseline(sourceHtml);
    if (!snapshot.trim()) {
      return;
    }

    baselineSnapshotRef.current = snapshot;
    cleanHtmlRef.current = snapshot;
    lastCleanPlainRef.current = buildPlainTextMap(snapshot).text;
    trackingRef.current = true;
    setTracking(true);
  }, []);

  const handleEditorInput = useCallback(() => {
    if (skipSyncRef.current) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const nextClean = extractCleanEditorHtml(editor.innerHTML);
    const nextPlain = buildPlainTextMap(nextClean).text;
    cleanHtmlRef.current = nextClean;
    setHasContent(nextPlain.trim().length > 0);

    if (!trackingRef.current) {
      return;
    }

    if (nextPlain === lastCleanPlainRef.current) {
      return;
    }

    scheduleTrackedRender(nextClean);
  }, [scheduleTrackedRender]);

  const handleTrackingToggle = useCallback(() => {
    clearNotice();

    if (!trackingRef.current) {
      const editorHtml = editorRef.current?.innerHTML ?? '';
      const clean = extractCleanEditorHtml(editorHtml);
      if (!clean.trim()) {
        showNotice('Add or paste text before tracking.', 'error');
        return;
      }

      establishBaseline(editorHtml);
      renderTrackedHtml(clean, getCaretCleanOffset(editorRef.current!));
      return;
    }

    const clean = extractCleanEditorHtml(editorRef.current?.innerHTML ?? '');
    cleanHtmlRef.current = clean;
    lastCleanPlainRef.current = buildPlainTextMap(clean).text;
    trackingRef.current = false;
    setTracking(false);
    syncEditorHtml(clean);
  }, [clearNotice, establishBaseline, renderTrackedHtml, showNotice, syncEditorHtml]);

  const resetEditor = useCallback(() => {
    if (renderFrameRef.current !== null) {
      window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
    }
    if (renderTimeoutRef.current !== null) {
      window.clearTimeout(renderTimeoutRef.current);
      renderTimeoutRef.current = null;
    }

    baselineSnapshotRef.current = null;
    cleanHtmlRef.current = '';
    lastCleanPlainRef.current = '';
    trackingRef.current = false;
    setTracking(false);
    syncEditorHtml('');
    onClearRegion();
    clearNotice();
  }, [clearNotice, onClearRegion, syncEditorHtml]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const hadBaseline = Boolean(baselineSnapshotRef.current);

      void pasteContentFromClipboard(event.clipboardData).then((content) => {
        document.execCommand('insertHTML', false, content);
        handleEditorInput();

        if (!hadBaseline) {
          const editorHtml = editorRef.current?.innerHTML ?? '';
          if (extractCleanEditorHtml(editorHtml).trim()) {
            establishBaseline(editorHtml);
          }
        }
      });
    },
    [establishBaseline, handleEditorInput],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      if (tryExpandListShortcut(event.nativeEvent, editor)) {
        handleEditorInput();
        return;
      }

      if (tryHandleListEnter(event.nativeEvent, editor)) {
        handleEditorInput();
      }
    },
    [handleEditorInput],
  );

  const handleCopyRedline = useCallback(async () => {
    const baseline = baselineSnapshotRef.current;
    const clean = extractCleanEditorHtml(editorRef.current?.innerHTML ?? cleanHtmlRef.current);

    if (!baseline) {
      showNotice('Turn on Track Changes first.', 'error');
      return;
    }

    if (!clean.trim()) {
      showNotice('Editor is empty.', 'error');
      return;
    }

    setCopying(true);
    clearNotice();

    try {
      const result = buildEditorRedline(baseline, clean);

      if (!result.changed) {
        showNotice('No changes to copy.', 'info');
        return;
      }

      const redlineHtml = unwrapRedlineDiv(result.html);
      await copyHtmlToClipboard(redlineHtml);
      showNotice('Copied — paste into your draft.', 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showNotice(message, 'error');
    } finally {
      setCopying(false);
    }
  }, [clearNotice, showNotice]);

  const handleBringToEditor = useCallback(async () => {
    if (!onBringToEditor) {
      return;
    }

    clearNotice();

    try {
      await onBringToEditor();
      showNotice('Text loaded.', 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showNotice(message, 'error');
    }
  }, [clearNotice, onBringToEditor, showNotice]);

  useLayoutEffect(() => {
    syncEditorHtml(initialState.cleanHtml);
    lastCleanPlainRef.current = buildPlainTextMap(initialState.cleanHtml).text;
  }, [initialState.cleanHtml, syncEditorHtml]);

  useLayoutEffect(() => {
    return () => {
      if (renderFrameRef.current !== null) {
        window.cancelAnimationFrame(renderFrameRef.current);
      }
      if (renderTimeoutRef.current !== null) {
        window.clearTimeout(renderTimeoutRef.current);
      }
    };
  }, []);

  const canCopy = tracking && hasContent && !copying;

  return (
    <section className="panel track-editor" aria-label="Track changes editor">
      <div className="panel__header">
        <h2 className="panel__heading">Editor</h2>
        <label className="switch">
          <span className="switch__label">Track Changes</span>
          <input
            type="checkbox"
            className="switch__input"
            checked={tracking}
            onChange={handleTrackingToggle}
            aria-label="Track Changes"
          />
          <span className="switch__track" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
        </label>
      </div>

      {notice && (
        <p
          className={`track-editor__notice track-editor__notice--${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}

      <div className="track-editor__editor-wrap">
        <button
          type="button"
          className="track-editor__copy-btn"
          disabled={!canCopy}
          onClick={() => void handleCopyRedline()}
          aria-label="Copy redline"
          title="Copy redline"
        >
          <CopyIcon />
          <span className="track-editor__copy-label">{copying ? 'Copying…' : 'Copy'}</span>
        </button>

        <div
          ref={editorRef}
          className="editor-field__input editor-field__input--rich track-editor__surface"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Track changes editor"
          data-placeholder={'Paste or select text and paste text here\nSelect text and bring to editor'}
          onInput={handleEditorInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          suppressContentEditableWarning
        />
      </div>

      <div className="track-editor__footer">
        {onBringToEditor && (
          <button
            type="button"
            className="btn btn--pill-muted track-editor__footer-btn"
            disabled={!composeEnabled || bringingToEditor}
            onClick={() => void handleBringToEditor()}
          >
            {bringingToEditor ? 'Loading…' : 'Bring to editor'}
          </button>
        )}
        <button
          type="button"
          className="btn btn--pill-dark track-editor__footer-btn track-editor__footer-btn--end"
          disabled={!hasContent}
          onClick={() => resetEditor()}
        >
          Clear
        </button>
      </div>

      {!composeEnabled && (
        <p className="controls__hint">Open a compose draft to use Bring to editor.</p>
      )}
    </section>
  );
}
