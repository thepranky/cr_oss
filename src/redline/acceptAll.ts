import { escapeHtml } from './render';
import type { DiffPart } from './types';

/** Apply a revision: keep equal and insert parts, discard deletes. */
export function acceptAllFromParts(parts: DiffPart[]): string {
  return parts
    .filter((part) => part.op !== 'delete')
    .map((part) => part.value)
    .join('');
}

/** Render accepted revision as clean HTML (no redline markup). */
export function acceptAllAsHtml(parts: DiffPart[]): string {
  const text = acceptAllFromParts(parts);
  return `<div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
}
