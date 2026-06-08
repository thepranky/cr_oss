import { normalizeEditorHtml } from './editorNormalize';
import { stripRedlineMarkup } from './stripRedline';
import { REDLINE_STYLES } from './types';
import { buildRegionRedline, type BuildRegionRedlineOptions } from './workflow';
import type { RedlineResult } from './index';

/** Extract the editable "current" document from a track-changes surface. */
export function extractCleanEditorHtml(html: string): string {
  return normalizeEditorHtml(stripRedlineMarkup(html));
}

/** Freeze a baseline snapshot for the editor — normalized once, never mutated. */
export function snapshotEditorBaseline(sourceHtml: string): string {
  return normalizeEditorHtml(stripRedlineMarkup(sourceHtml));
}

function normalizeStyle(style: string): string {
  return style.replace(/\s/g, '').toLowerCase();
}

function isDeleteStyle(style: string): boolean {
  const normalized = normalizeStyle(style);
  return (
    normalized === normalizeStyle(REDLINE_STYLES.delete) ||
    (normalized.includes('color:red') && normalized.includes('line-through'))
  );
}

function isInsertStyle(style: string): boolean {
  const normalized = normalizeStyle(style);
  return (
    normalized === normalizeStyle(REDLINE_STYLES.insert) ||
    (normalized.includes('color:blue') && normalized.includes('underline'))
  );
}

/** Mark redline spans so caret logic and contenteditable can treat them safely. */
export function decorateEditorRedlineHtml(html: string): string {
  if (!html.trim() || typeof DOMParser === 'undefined') {
    return html;
  }

  const doc = new DOMParser().parseFromString(`<div data-editor-root="">${html}</div>`, 'text/html');
  const root = doc.body.querySelector('[data-editor-root]');
  if (!root) {
    return html;
  }

  root.querySelectorAll('span[style]').forEach((span) => {
    const style = span.getAttribute('style') ?? '';
    if (isDeleteStyle(style)) {
      span.setAttribute('data-redline', 'delete');
      span.setAttribute('contenteditable', 'false');
      return;
    }

    if (isInsertStyle(style)) {
      span.setAttribute('data-redline', 'insert');
    }
  });

  return root.innerHTML;
}

/** Build Word-style track changes for the editor using a frozen baseline snapshot. */
export function buildEditorRedline(
  baselineSnapshot: string,
  currentSurfaceHtml: string,
  options: BuildRegionRedlineOptions = {},
): RedlineResult {
  const currentClean = extractCleanEditorHtml(currentSurfaceHtml);
  return buildRegionRedline(baselineSnapshot, currentClean, options);
}
