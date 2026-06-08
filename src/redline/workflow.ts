import { unwrapRedundantListWrapper } from './htmlBlocks';
import { buildRedline, type RedlineResult } from './index';

export function hasHtmlContent(html?: string): boolean {
  return Boolean(html?.trim());
}

export interface BuildRegionRedlineOptions {
  /** Word-level diff inside blocks — better for the contenteditable editor. */
  inlineDiff?: boolean;
}

/** Redline options shared by selection and editor region workflows. */
export function buildRegionRedline(
  baselineHtml: string,
  currentRegionHtml: string,
  options: BuildRegionRedlineOptions = {},
): RedlineResult {
  const result = buildRedline(baselineHtml, currentRegionHtml, {
    baselineIsHtml: hasHtmlContent(baselineHtml),
    currentIsHtml: true,
    inlineDiff: options.inlineDiff,
  });

  return {
    ...result,
    html: unwrapRegionRedlineHtml(result.html),
    cleanHtml: unwrapRegionRedlineHtml(result.cleanHtml),
  };
}

function unwrapRegionRedlineHtml(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<div>([\s\S]*)<\/div>$/i);
  const inner = match ? match[1].trim() : trimmed;
  return unwrapRedundantListWrapper(inner);
}

/** Redline options shared by full-body Start Tracking → Show Redline. */
export function buildFullDraftRedline(baselineHtml: string, currentBodyHtml: string): RedlineResult {
  return buildRedline(baselineHtml, currentBodyHtml, {
    baselineIsHtml: hasHtmlContent(baselineHtml),
    currentIsHtml: true,
    envelopeHtml: currentBodyHtml,
  });
}
