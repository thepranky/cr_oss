import { acceptAllAsHtml, acceptAllFromParts } from './acceptAll';
import { finalizeBodyHtml } from './bodyEnvelope';
import {
  extractDominantFormatting,
  type FormattingContext,
} from './dominantStyle';
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
  /** Use word/char diff on the fragment instead of block-level list/paragraph alignment. */
  inlineDiff?: boolean;
  /** Original compose HTML used to restore outer wrapper tags (font, dir, class). */
  envelopeHtml?: string;
}

function canPreserveFormatting(options: BuildRedlineOptions): boolean {
  return options.baselineIsHtml === true && options.currentIsHtml === true;
}

function buildFormattingContext(baseline: string, preserve: boolean): FormattingContext | undefined {
  if (!preserve) {
    return undefined;
  }
  return { dominant: extractDominantFormatting(baseline) };
}

function applyEnvelope(sourceHtml: string | undefined, innerHtml: string): string {
  if (!sourceHtml?.trim()) {
    return innerHtml.startsWith('<div') ? innerHtml : `<div>${innerHtml}</div>`;
  }
  return finalizeBodyHtml(sourceHtml, innerHtml);
}

/** Build a full redline from baseline and current content (plain text or HTML). */
export function buildRedline(
  baseline: string,
  current: string,
  options: BuildRedlineOptions = {},
): RedlineResult {
  const preserve = canPreserveFormatting(options);
  const formatting = buildFormattingContext(baseline, preserve);

  const baselineMap = preserve ? buildPlainTextMap(baseline) : null;
  const currentMap = preserve ? buildPlainTextMap(current) : null;

  const oldText = preserve
    ? baselineMap!.text
    : normalizeForDiff(baseline, options.baselineIsHtml ?? false);
  const newText = preserve
    ? currentMap!.text
    : normalizeForDiff(current, options.currentIsHtml ?? false);

  const parts = computeDiff(oldText, newText);
  const envelopeSource = options.envelopeHtml ?? current;

  if (preserve && !options.inlineDiff) {
    const blockResult = buildBlockPreservingRedline(baseline, current, formatting);
    if (blockResult) {
      return {
        parts: blockResult.parts,
        html: applyEnvelope(envelopeSource, blockResult.html),
        cleanText: acceptAllFromParts(blockResult.parts),
        cleanHtml: applyEnvelope(envelopeSource, blockResult.cleanHtml),
        changed: hasChanges(blockResult.parts),
      };
    }
  }

  if (preserve && baselineMap && currentMap) {
    const html = renderPreservingHtml(parts, baselineMap, currentMap, formatting);
    const cleanHtml = renderPreservingCleanHtml(parts, currentMap, formatting);
    return {
      parts,
      html: applyEnvelope(envelopeSource, unwrapRedlineDiv(html)),
      cleanText: acceptAllFromParts(parts),
      cleanHtml: applyEnvelope(envelopeSource, unwrapRedlineDiv(cleanHtml)),
      changed: hasChanges(parts),
    };
  }

  return {
    parts,
    html: applyEnvelope(envelopeSource, unwrapRedlineDiv(renderRedlineHtml(parts, formatting?.dominant))),
    cleanText: acceptAllFromParts(parts),
    cleanHtml: applyEnvelope(envelopeSource, unwrapRedlineDiv(acceptAllAsHtml(parts))),
    changed: hasChanges(parts),
  };
}

function unwrapRedlineDiv(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<div>([\s\S]*)<\/div>$/i);
  return match ? match[1] : trimmed;
}

/** Convenience helper for plain-text inputs. */
export function buildRedlineFromPlainText(baseline: string, current: string): RedlineResult {
  return buildRedline(normalizePlainText(baseline), normalizePlainText(current));
}

export { acceptAllAsHtml, acceptAllFromParts } from './acceptAll';
export { computeDiff, changedCharRatio, hasChanges } from './diff';
export {
  extractBodyWrapper,
  finalizeBodyHtml,
  type BodyWrapper,
} from './bodyEnvelope';
export {
  buildBlockPreservingRedline,
  extractHtmlBlocks,
  groupListBlocks,
  groupedBlockFrom,
  wrapBlock,
  EMAIL_LIST_STYLE,
  EMAIL_UL_STYLE,
  EMAIL_OL_STYLE,
  type GroupedBlockHtml,
  type HtmlBlock,
  type ListType,
} from './htmlBlocks';
export {
  extractDominantFormatting,
  wrapWithDominantBlock,
  wrapWithDominantInline,
  type DominantFormatting,
  type FormattingContext,
} from './dominantStyle';
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
export { buildFullDraftRedline, buildRegionRedline, hasHtmlContent } from './workflow';
export { pasteContentFromClipboard, preprocessWordHtml, sanitizeWordHtml } from './sanitizeWordHtml';
export { stripRedlineMarkup } from './stripRedline';
export {
  REDLINE_STYLES,
  type DiffOperation,
  type DiffPart,
  type SelectionAnchors,
  type TrackingSnapshot,
} from './types';
