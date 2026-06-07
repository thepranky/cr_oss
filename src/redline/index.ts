import { acceptAllAsHtml, acceptAllFromParts } from './acceptAll';
import { buildBlockPreservingRedline } from './htmlBlocks';
import { computeDiff, hasChanges } from './diff';
import { buildPlainTextMap } from './htmlPlainMap';
import { normalizeForDiff, normalizePlainText } from './normalize';
import { renderRedlineHtml } from './render';
import { renderPreservingCleanHtml, renderPreservingHtml } from './renderPreserving';
import type { DiffPart } from './types';

export interface RedlineResult {
  parts: DiffPart[];
  html: string;
  cleanText: string;
  cleanHtml: string;
  changed: boolean;
}

export interface BuildRedlineOptions {
  baselineIsHtml?: boolean;
  currentIsHtml?: boolean;
}

function canPreserveFormatting(options: BuildRedlineOptions): boolean {
  return options.baselineIsHtml === true && options.currentIsHtml === true;
}

/** Build a full redline from baseline and current content (plain text or HTML). */
export function buildRedline(
  baseline: string,
  current: string,
  options: BuildRedlineOptions = {},
): RedlineResult {
  const preserve = canPreserveFormatting(options);

  const baselineMap = preserve ? buildPlainTextMap(baseline) : null;
  const currentMap = preserve ? buildPlainTextMap(current) : null;

  const oldText = preserve
    ? baselineMap!.text
    : normalizeForDiff(baseline, options.baselineIsHtml ?? false);
  const newText = preserve
    ? currentMap!.text
    : normalizeForDiff(current, options.currentIsHtml ?? false);

  const parts = computeDiff(oldText, newText);

  if (preserve) {
    const blockResult = buildBlockPreservingRedline(baseline, current);
    if (blockResult) {
      return {
        parts: blockResult.parts,
        html: blockResult.html,
        cleanText: acceptAllFromParts(blockResult.parts),
        cleanHtml: blockResult.cleanHtml,
        changed: hasChanges(blockResult.parts),
      };
    }

    if (baselineMap && currentMap) {
      return {
        parts,
        html: renderPreservingHtml(parts, baselineMap, currentMap),
        cleanText: acceptAllFromParts(parts),
        cleanHtml: renderPreservingCleanHtml(parts, currentMap),
        changed: hasChanges(parts),
      };
    }
  }

  return {
    parts,
    html: renderRedlineHtml(parts),
    cleanText: acceptAllFromParts(parts),
    cleanHtml: acceptAllAsHtml(parts),
    changed: hasChanges(parts),
  };
}

/** Convenience helper for plain-text inputs. */
export function buildRedlineFromPlainText(baseline: string, current: string): RedlineResult {
  return buildRedline(normalizePlainText(baseline), normalizePlainText(current));
}

export { acceptAllAsHtml, acceptAllFromParts } from './acceptAll';
export { computeDiff, changedCharRatio, hasChanges } from './diff';
export {
  buildBlockPreservingRedline,
  extractHtmlBlocks,
  groupListBlocks,
  EMAIL_UL_STYLE,
  type HtmlBlock,
} from './htmlBlocks';
export { decodeHtmlEntities, htmlToPlainText, normalizeForDiff, normalizePlainText } from './normalize';
export { escapeHtml, formatTextForHtml, renderRedlineHtml } from './render';
export { renderPreservingCleanHtml, renderPreservingHtml } from './renderPreserving';
export {
  buildPlainTextMap,
  buildInlinePlainTextMap,
  sliceMapRange,
  wrapConsecutiveListItems,
  type PlainTextMap,
} from './htmlPlainMap';
export {
  docxBytesToRedlineHtml,
  ooxmlDocumentToHtml,
  readDocxFromClipboard,
  tryPasteFromWordOoxml,
} from './wordOoxml';
export { pasteContentFromClipboard, preprocessWordHtml, sanitizeWordHtml } from './sanitizeWordHtml';
export { REDLINE_STYLES, type DiffOperation, type DiffPart, type TrackingSnapshot } from './types';
