// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildBlockPreservingRedline, groupListBlocks } from '../redline/htmlBlocks';
import { REDLINE_STYLES } from '../redline/types';

describe('htmlBlocks', () => {
  it('groupListBlocks wraps consecutive li elements in ul', () => {
    expect(groupListBlocks(['<li>One</li>', '<li>Two</li>'])).toContain('<ul');
    expect(groupListBlocks(['<li>One</li>', '<li>Two</li>'])).toContain('<li>One</li>');
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
});
