import { useCallback, useState } from 'react';
import { getBodyHtml, getBodyText, setBodyHtml } from '../outlook/body';
import {
  extractRegionHtml,
  replaceRegionInHtml,
  captureComposeSelectionAnchors,
} from '../outlook/bodyRegion';
import { resolveSelectionHtml } from '../outlook/selectionHtml';
import { getSelectedHtml, getSelectedText } from '../outlook/selection';
import {
  buildFullDraftRedline,
  buildRegionRedline,
  hasHtmlContent,
} from '../redline/workflow';
import { buildPlainTextMap } from '../redline/htmlPlainMap';
import type { TrackingSnapshot } from '../redline/types';

type TrackingAction = 'start' | 'show';

export function useTracking() {
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [redlineInserted, setRedlineInserted] = useState(false);
  const [loadingAction, setLoadingAction] = useState<TrackingAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startTracking = useCallback(async () => {
    setLoadingAction('start');
    setError(null);
    setRedlineInserted(false);

    try {
      let selectedText = '';
      try {
        selectedText = await getSelectedText();
      } catch {
        // Selection may be unavailable on some hosts — fall back to full body.
      }

      if (selectedText.trim()) {
        const bodyHtml = await getBodyHtml();
        const bodyText = buildPlainTextMap(bodyHtml).text;
        let selectedHtmlForMatch = '';
        try {
          selectedHtmlForMatch = (await getSelectedHtml()).trim();
        } catch {
          selectedHtmlForMatch = '';
        }

        const anchors =
          captureComposeSelectionAnchors(bodyText, selectedText, {
            bodyHtml,
            selectionHtml: selectedHtmlForMatch || undefined,
          }) ?? undefined;

        let baselineHtml: string | undefined;
        if (anchors) {
          baselineHtml = await resolveSelectionHtml(bodyHtml, anchors, {
            selectedText,
            selectedHtml: selectedHtmlForMatch || undefined,
          });
        }

        const baselineText = hasHtmlContent(baselineHtml)
          ? buildPlainTextMap(baselineHtml!).text
          : selectedText;

        setSnapshot({
          baselineText,
          baselineHtml,
          capturedAt: new Date().toISOString(),
          scope: 'selection',
          anchors,
          captureBodyPlain: bodyText,
        });
        return;
      }

      const baselineHtml = await getBodyHtml();
      const baselineText = buildPlainTextMap(baselineHtml).text || (await getBodyText());
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
      setLoadingAction(null);
    }
  }, []);

  const showRedline = useCallback(async () => {
    if (!snapshot) {
      setError('Start tracking changes before inserting a redline.');
      return;
    }

    setLoadingAction('show');
    setError(null);

    try {
      const bodyHtml = await getBodyHtml();

      if (snapshot.scope === 'selection' && snapshot.anchors) {
        const currentRegionHtml = extractRegionHtml(bodyHtml, snapshot.anchors);
        const baseline = snapshot.baselineHtml ?? snapshot.baselineText;
        const result = buildRegionRedline(baseline, currentRegionHtml);

        if (!result.changed) {
          return;
        }

        const updatedBody = replaceRegionInHtml(bodyHtml, snapshot.anchors, result.html, {
          captureBodyPlain: snapshot.captureBodyPlain,
        });
        await setBodyHtml(updatedBody);
      } else {
        const baseline = snapshot.baselineHtml ?? snapshot.baselineText;
        const result = buildFullDraftRedline(baseline, bodyHtml);

        if (!result.changed) {
          return;
        }

        await setBodyHtml(result.html);
      }

      setRedlineInserted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoadingAction(null);
    }
  }, [snapshot]);

  const stopTracking = useCallback(() => {
    setSnapshot(null);
    setRedlineInserted(false);
    setError(null);
  }, []);

  return {
    snapshot,
    redlineInserted,
    loadingAction,
    error,
    startTracking,
    stopTracking,
    showRedline,
  };
}
