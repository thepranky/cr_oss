import type { FormattingContext } from './dominantStyle';
import {
  resolveInsertHtml,
  sliceMapRange,
  sliceWithFormattingPreference,
  wrapConsecutiveListItems,
  type PlainTextMap,
} from './htmlPlainMap';
import { formatTextForHtml } from './render';
import { REDLINE_STYLES, type DiffPart } from './types';

interface RenderFromMapsOptions {
  /** When false, emit clean revised HTML (Accept All) without redline styling. */
  markChanges?: boolean;
  formatting?: FormattingContext;
}

function renderPartsFromMaps(
  parts: DiffPart[],
  baselineMap: PlainTextMap,
  currentMap: PlainTextMap,
  options: RenderFromMapsOptions = {},
): string {
  const markChanges = options.markChanges ?? true;
  const formatting = options.formatting;
  let oldCursor = 0;
  let newCursor = 0;
  let output = '';

  for (const part of parts) {
    const length = part.value.length;

    switch (part.op) {
      case 'equal': {
        output += sliceWithFormattingPreference(
          baselineMap,
          currentMap,
          oldCursor,
          oldCursor + length,
          newCursor,
          newCursor + length,
          formatting,
        );
        oldCursor += length;
        newCursor += length;
        break;
      }
      case 'delete': {
        if (markChanges) {
          const deleted =
            sliceMapRange(baselineMap, oldCursor, oldCursor + length, formatting) ||
            formatTextForHtml(part.value, formatting?.dominant);
          output += `<span style="${REDLINE_STYLES.delete}">${deleted}</span>`;
        }
        oldCursor += length;
        break;
      }
      case 'insert': {
        if (markChanges) {
          const inserted = resolveInsertHtml(
            baselineMap,
            currentMap,
            oldCursor,
            newCursor,
            newCursor + length,
            part.value,
            formatting,
          );
          output += `<span style="${REDLINE_STYLES.insert}">${inserted}</span>`;
        } else {
          output += sliceWithFormattingPreference(
            baselineMap,
            currentMap,
            oldCursor,
            oldCursor,
            newCursor,
            newCursor + length,
            formatting,
          );
        }
        newCursor += length;
        break;
      }
    }
  }

  return wrapConsecutiveListItems(output);
}

/** Render diff parts while preserving unchanged HTML formatting from the source maps. */
export function renderPreservingHtml(
  parts: DiffPart[],
  baselineMap: PlainTextMap,
  currentMap: PlainTextMap,
  formatting?: FormattingContext,
): string {
  const inner = renderPartsFromMaps(parts, baselineMap, currentMap, {
    markChanges: true,
    formatting,
  });
  return `<div>${inner}</div>`;
}

/** Clean revised HTML without redline markup, preserving formatting where possible. */
export function renderPreservingCleanHtml(
  parts: DiffPart[],
  currentMap: PlainTextMap,
  formatting?: FormattingContext,
): string {
  const inner = renderPartsFromMaps(
    parts,
    { text: '', segments: [] },
    currentMap,
    { markChanges: false, formatting },
  );
  return `<div>${inner}</div>`;
}
