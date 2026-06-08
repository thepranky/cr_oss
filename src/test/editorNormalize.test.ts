// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { normalizeEditorHtml } from '../redline/editorNormalize';
import { extractHtmlBlocks } from '../redline/htmlBlocks';

describe('normalizeEditorHtml', () => {
  it('merges adjacent numbered lists broken by contenteditable', () => {
    const html = '<ol><li>One</li></ol><ol><li>Two</li></ol>';
    const normalized = normalizeEditorHtml(html);

    expect(normalized.match(/<ol/g)?.length).toBe(1);
    expect(normalized.match(/<li/g)?.length).toBe(2);
    expect(extractHtmlBlocks(normalized).length).toBe(2);
  });

  it('unwraps div wrappers inside list items', () => {
    const html = '<ol><li><div>First point</div></li></ol>';
    const normalized = normalizeEditorHtml(html);

    expect(normalized).toContain('<li>First point</li>');
    expect(normalized).not.toContain('<li><div>');
  });

  it('applies list styles when missing', () => {
    const html = '<ul><li>Item</li></ul>';
    const normalized = normalizeEditorHtml(html);

    expect(normalized).toContain('list-style-type');
  });
});
