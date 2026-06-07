import { useCallback, useState } from 'react';
import { getBodyHtml, getBodyText, setBodyHtml } from '../outlook/body';
import { getSelectedHtml, getSelectedText } from '../outlook/selection';
import { buildRedline, type RedlineResult } from '../redline';
import type { TrackingSnapshot } from '../redline/types';

type TrackingAction = 'start' | 'show' | 'accept';

export function useTracking() {
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [lastRedline, setLastRedline] = useState<RedlineResult | null>(null);
  const [loadingAction, setLoadingAction] = useState<TrackingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loading = loadingAction !== null;

  const startTracking = useCallback(async () => {
    setLoadingAction('start');
    setError(null);
    setStatusMessage(null);
    setLastRedline(null);

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
        setStatusMessage('Baseline captured from selection.');
        return;
      }

      const [baselineText, baselineHtml] = await Promise.all([getBodyText(), getBodyHtml()]);
      setSnapshot({
        baselineText,
        baselineHtml,
        capturedAt: new Date().toISOString(),
        scope: 'full',
      });
      setStatusMessage('Baseline captured from full draft body.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoadingAction(null);
    }
  }, []);

  const showRedline = useCallback(async () => {
    if (!snapshot) {
      setError('Start Tracking before showing a redline.');
      return;
    }

    setLoadingAction('show');
    setError(null);
    setStatusMessage(null);

    try {
      const currentHtml = await getBodyHtml();
      const result = buildRedline(snapshot.baselineHtml ?? snapshot.baselineText, currentHtml, {
        baselineIsHtml: snapshot.baselineHtml !== undefined || snapshot.scope === 'full',
        currentIsHtml: true,
      });

      if (!result.changed) {
        setStatusMessage('No changes detected since the baseline.');
        return;
      }

      await setBodyHtml(result.html);
      setLastRedline(result);
      setStatusMessage('Redline applied to the draft.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoadingAction(null);
    }
  }, [snapshot]);

  const acceptAll = useCallback(async () => {
    if (!snapshot) {
      setError('Start Tracking before accepting changes.');
      return;
    }

    setLoadingAction('accept');
    setError(null);
    setStatusMessage(null);

    try {
      let cleanHtml: string;

      if (lastRedline) {
        cleanHtml = lastRedline.cleanHtml;
      } else {
        const currentHtml = await getBodyHtml();
        const result = buildRedline(snapshot.baselineHtml ?? snapshot.baselineText, currentHtml, {
          baselineIsHtml: snapshot.baselineHtml !== undefined || snapshot.scope === 'full',
          currentIsHtml: true,
        });

        if (!result.changed) {
          setStatusMessage('No changes to accept.');
          return;
        }
        cleanHtml = result.cleanHtml;
      }

      await setBodyHtml(cleanHtml);
      setLastRedline(null);
      setStatusMessage('Accepted all changes — draft updated with clean revised text.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoadingAction(null);
    }
  }, [snapshot, lastRedline]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    snapshot,
    loading,
    loadingAction,
    error,
    statusMessage,
    startTracking,
    showRedline,
    acceptAll,
    clearError,
  };
}
