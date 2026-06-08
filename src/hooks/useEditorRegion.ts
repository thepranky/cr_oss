import { useCallback } from 'react';
import { getSelectedHtml, getSelectedText } from '../outlook/selection';

/** Load the current compose selection into the editor — HTML first to keep formatting. */
export function useEditorRegion() {
  const bringSelectionToEditor = useCallback(async () => {
    const [selectedText, selectedHtml] = await Promise.all([
      getSelectedText().catch(() => ''),
      getSelectedHtml().catch(() => ''),
    ]);

    const text = selectedText.trim();
    if (!text) {
      throw new Error('Select text in the email draft first.');
    }

    const html = selectedHtml.trim() || text;
    return { html, text };
  }, []);

  return { bringSelectionToEditor };
}
