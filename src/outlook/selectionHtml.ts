import { extractRegionHtml, scoreSelectionAgainstBaseline } from './bodyRegion';
import { getSelectedHtml } from './selection';
import { buildPlainTextMap } from '../redline/htmlPlainMap';
import type { SelectionAnchors } from '../redline/types';

export interface ResolveSelectionHtmlOptions {
  selectedText?: string;
  selectedHtml?: string;
}

/**
 * Resolve selection HTML with full compose formatting.
 * Prefer body-region extraction so list wrappers, block styles, and inherited fonts survive.
 */
export async function resolveSelectionHtml(
  bodyHtml: string,
  anchors: SelectionAnchors,
  options?: ResolveSelectionHtmlOptions,
): Promise<string | undefined> {
  const selectedText = options?.selectedText?.trim();
  const selectedHtml = options?.selectedHtml?.trim();

  try {
    const fromBody = extractRegionHtml(bodyHtml, anchors).trim();
    if (fromBody) {
      const fromBodyPlain = buildPlainTextMap(fromBody).text;
      if (
        !selectedText ||
        scoreSelectionAgainstBaseline(fromBodyPlain, selectedText) >= 500 ||
        scoreSelectionAgainstBaseline(fromBody, selectedText) >= 500
      ) {
        return fromBody;
      }
    }
  } catch {
    // Fall back to host selection HTML when region extraction fails.
  }

  if (selectedHtml) {
    return selectedHtml;
  }

  try {
    const selected = (await getSelectedHtml()).trim();
    if (selected) {
      return selected;
    }
  } catch {
    // Selection HTML may be unavailable on some hosts.
  }

  if (selectedText) {
    return selectedText;
  }

  return undefined;
}
