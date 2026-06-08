// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildBlockPreservingRedline, groupListBlocks } from '../redline/htmlBlocks';
import { REDLINE_STYLES } from '../redline/types';

describe('htmlBlocks', () => {
  it('groupListBlocks wraps consecutive li elements in ul', () => {
    expect(groupListBlocks([{ html: '<li>One</li>' }, { html: '<li>Two</li>' }])).toContain('<ul');
    expect(groupListBlocks([{ html: '<li>One</li>' }, { html: '<li>Two</li>' }])).toContain('<li>One</li>');
  });

  it('groupListBlocks preserves original ol wrapper indentation from snapshot', () => {
    const grouped = groupListBlocks([
      {
        html: '<li style="margin-left:36pt;text-indent:-18pt;">First item</li>',
        listType: 'ol',
        listWrapperStyle: 'margin-top:0;margin-bottom:0;margin-left:18pt;',
      },
      {
        html: '<li style="margin-left:36pt;text-indent:-18pt;">Second item</li>',
        listType: 'ol',
        listWrapperStyle: 'margin-top:0;margin-bottom:0;margin-left:18pt;',
      },
    ]);

    expect(grouped).toContain('margin-left:18pt');
    expect(grouped).toContain('margin-left:36pt');
    expect(grouped).toContain('text-indent:-18pt');
    expect(grouped).not.toContain('padding-left:24px');
  });

  it('groupListBlocks wraps ordered list items in ol', () => {
    const grouped = groupListBlocks([
      { html: '<li>One</li>', listType: 'ol' },
      { html: '<li>Two</li>', listType: 'ol' },
    ]);
    expect(grouped).toContain('<ol');
    expect(grouped).toContain('list-style-type:decimal');
    expect(grouped).not.toMatch(/<ul[^>]*>/);
  });

  it('keeps numbered lists when contenteditable drops ol wrappers', () => {
    const baseline =
      '<ol><li>We will circulate a short information request.</li><li>Arcadian will provide an initial document pack.</li></ol>';
    const current =
      '<li>We will circulate a short information request.</li><li>Arcadian will provide an initial document pack.</li>';

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result).not.toBeNull();
    expect(result!.html).toContain('<ol');
    expect(result!.html).toContain('list-style-type:decimal');
    expect(result!.cleanHtml).toContain('<ol');
  });

  it('keeps unchanged list items and marks edited item without losing bullets', () => {
    const baseline = '<ul><li>First</li><li>Second</li></ul>';
    const current = '<ul><li>First</li><li>Second item</li></ul>';

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result).not.toBeNull();
    expect(result!.html).toContain('<ul');
    expect(result!.html).toContain('<li>First</li>');
    expect(result!.html).toContain('color:blue');
    expect(result!.html).toContain('Second');
  });

  it('accept clean output keeps list structure', () => {
    const baseline = '<ul><li>First</li><li>Second</li></ul>';
    const current = '<ul><li>First</li><li>Second item</li></ul>';

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result!.cleanHtml).toContain('<ul');
    expect(result!.cleanHtml).toContain('<li>First</li>');
    expect(result!.cleanHtml).toContain('Second item');
    expect(result!.cleanHtml).not.toContain('color:red');
  });

  it('preserves inline styling on inserted words inside a paragraph block', () => {
    const baseline = '<p><b>The parties agree</b> to the terms.</p>';
    const current = '<p><b>The parties agree</b> to the revised terms.</p>';

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result).not.toBeNull();
    expect(result!.html).not.toContain('<div>The parties');
    expect(result!.html).toContain('<b>The parties agree</b>');
    expect(result!.html).toContain('revised');
    expect(result!.html).toContain('color:blue');
  });

  it('preserves paragraph block styles including line spacing', () => {
    const baseline =
      '<p style="margin-bottom:12pt;line-height:115%;">First paragraph</p><p style="margin-bottom:12pt;line-height:115%;">Second paragraph</p>';
    const current =
      '<p style="margin-bottom:12pt;line-height:115%;">First paragraph</p><p style="margin-bottom:12pt;line-height:115%;">Second paragraph updated</p>';

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result).not.toBeNull();
    expect(result!.html).toContain('margin-bottom:12pt');
    expect(result!.html).toContain('line-height:115%');
    expect(result!.html).toContain('updated');
  });

  it('keeps spacer paragraphs used for vertical spacing', () => {
    const baseline =
      '<p style="margin-bottom:12pt;">Hello</p><p>&nbsp;</p><p style="margin-bottom:12pt;">World</p>';
    const current =
      '<p style="margin-bottom:12pt;">Hello</p><p style="margin-bottom:12pt;">World</p>';

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result).not.toBeNull();
    expect(result!.html).toContain('color:red');
    expect(result!.html).toContain('&nbsp;');
  });

  it('localizes a one-character edit inside a paired paragraph block', () => {
    const sentence =
      'The parties agree that the consultant shall deliver the final report no later than March 31.';
    const baseline = `<p><span style="font-size:14pt;font-family:Calibri;">${sentence}</span></p>`;
    const current = `<p><span style="font-size:14pt;font-family:Calibri;">${sentence.replace('31', '32')}</span></p>`;

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result).not.toBeNull();
    expect(result!.html).toContain('font-size:14pt');
    expect(result!.html).toContain('color:blue');
    expect(result!.html).not.toContain(
      `<span style="${REDLINE_STYLES.delete}">${sentence}</span>`,
    );
  });

  it('localizes trailing-word edits inside a single list item', () => {
    const baseline = '<li>Trying to editor panel now</li>';
    const current = '<li>Trying to editor panel now, good changes mate</li>';

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result).not.toBeNull();
    expect(result!.html).toContain('Trying to editor panel now');
    expect(result!.html).toContain('good changes mate');
    expect(result!.html).not.toContain(
      `<span style="${REDLINE_STYLES.delete}">Trying to editor panel now</span>`,
    );
    expect(result!.html.match(/<li/g)?.length).toBe(1);
  });

  it('localizes edits when baseline is li and current is plain contenteditable output', () => {
    const baseline = '<li>Trying to editor panel now</li>';
    const current = 'Trying to editor panel now, good changes mate';

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result).not.toBeNull();
    expect(result!.html).not.toContain(
      `<span style="${REDLINE_STYLES.delete}">Trying to editor panel now</span>`,
    );
  });
});
