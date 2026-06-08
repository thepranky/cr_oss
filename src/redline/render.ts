import type { DominantFormatting } from './dominantStyle';
import { wrapWithDominantInline } from './dominantStyle';
import { REDLINE_STYLES, type DiffPart } from './types';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatTextForHtml(
  text: string,
  dominant?: DominantFormatting | null,
): string {
  if (dominant?.inlineStyle) {
    return wrapWithDominantInline(text, dominant);
  }
  return escapeHtml(text).replace(/\n/g, '<br>');
}

/** Render diff parts as email-safe HTML with inline redline styles (plain text only). */
export function renderRedlineHtml(
  parts: DiffPart[],
  dominant?: DominantFormatting | null,
): string {
  const inner = parts
    .map((part) => {
      const formatted = formatTextForHtml(part.value, dominant);
      switch (part.op) {
        case 'delete':
          return `<span style="${REDLINE_STYLES.delete}">${formatted}</span>`;
        case 'insert':
          return `<span style="${REDLINE_STYLES.insert}">${formatted}</span>`;
        default:
          return formatted;
      }
    })
    .join('');

  return `<div>${inner}</div>`;
}
