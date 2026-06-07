import { REDLINE_STYLES, type DiffPart } from './types';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatTextForHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

/** Render diff parts as email-safe HTML with inline redline styles (plain text only). */
export function renderRedlineHtml(parts: DiffPart[]): string {
  const inner = parts
    .map((part) => {
      const formatted = formatTextForHtml(part.value);
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
