import { useCallback, useEffect, useRef } from 'react';
import { pasteContentFromClipboard } from '../redline/sanitizeWordHtml';

interface RichTextFieldProps {
  label: string;
  placeholder: string;
  html: string;
  onChange: (html: string) => void;
}

function insertHtmlAtSelection(html: string) {
  document.execCommand('insertHTML', false, html);
}

export function RichTextField({ label, placeholder, html, onChange }: RichTextFieldProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || isInternalUpdate.current) {
      return;
    }

    if (editor.innerHTML !== html) {
      editor.innerHTML = html;
    }
  }, [html]);

  const syncFromEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    onChange(editor.innerHTML);
  }, [onChange]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      void pasteContentFromClipboard(event.clipboardData).then((content) => {
        insertHtmlAtSelection(content);
        syncFromEditor();
      });
    },
    [syncFromEditor],
  );

  const handleInput = useCallback(() => {
    isInternalUpdate.current = true;
    syncFromEditor();
    isInternalUpdate.current = false;
  }, [syncFromEditor]);

  return (
    <label className="editor-field">
      <span className="editor-field__label">{label}</span>
      <div
        ref={editorRef}
        className="editor-field__input editor-field__input--rich"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-placeholder={placeholder}
        onPaste={handlePaste}
        onInput={handleInput}
        suppressContentEditableWarning
      />
    </label>
  );
}
