// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  buildEditorRedline,
  decorateEditorRedlineHtml,
  snapshotEditorBaseline,
} from '../redline/editorRedline';
import { REDLINE_STYLES } from '../redline/types';

describe('editorRedline', () => {
  it('freezes a normalized baseline snapshot', () => {
    const snapshot = snapshotEditorBaseline('<ol><li><div>One</div></li></ol>');
    expect(snapshot).toContain('<li>One</li>');
    expect(snapshot).not.toContain('<div>');
  });

  it('localizes edits inside numbered list items', () => {
    const baseline = snapshotEditorBaseline('<ol><li>First item</li><li>Second item</li></ol>');
    const current = '<ol><li>First item</li><li>Second item changed</li></ol>';

    const result = buildEditorRedline(baseline, current);

    expect(result.changed).toBe(true);
    expect(result.html).toContain('changed');
    expect(result.html).not.toContain(
      `<span style="${REDLINE_STYLES.delete}">Second item</span>`,
    );
    expect(result.html.match(/<li/g)?.length).toBe(2);
  });

  it('decorates delete spans as non-editable track changes', () => {
    const html = `<p><span style="${REDLINE_STYLES.delete}">old</span> new</p>`;
    const decorated = decorateEditorRedlineHtml(html);

    expect(decorated).toContain('data-redline="delete"');
    expect(decorated).toContain('contenteditable="false"');
  });
});
