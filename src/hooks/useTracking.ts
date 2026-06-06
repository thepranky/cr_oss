import { useCallback, useState } from 'react';
import { getBodyHtml, getBodyText } from '../outlook/body';
import { getSelectedHtml, getSelectedText } from '../outlook/selection';
import type { TrackingSnapshot } from '../redline/types';

export function useTracking() {
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTracking = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let selectedText = '';
      try {
        selectedText = await getSelectedText();
      } catch {
        // Selection may be unavailable on some hosts — fall back to full body.
      }

      if (selectedText.trim()) {
        let baselineHtml: string | undefined;
        try {
          const html = await getSelectedHtml();
          if (html.trim()) {
            baselineHtml = html;
          }
        } catch {
          // HTML selection is optional for the baseline snapshot.
        }

        setSnapshot({
          baselineText: selectedText,
          baselineHtml,
          capturedAt: new Date().toISOString(),
          scope: 'selection',
        });
        return;
      }

      const [baselineText, baselineHtml] = await Promise.all([getBodyText(), getBodyHtml()]);
      setSnapshot({
        baselineText,
        baselineHtml,
        capturedAt: new Date().toISOString(),
        scope: 'full',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { snapshot, loading, error, startTracking, clearError };
}
