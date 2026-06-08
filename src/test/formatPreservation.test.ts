// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildRedline } from '../redline';
import { buildPlainTextMap } from '../redline/htmlPlainMap';
import { REDLINE_STYLES } from '../redline/types';

describe('format preservation during redline', () => {
  it('buildPlainTextMap keeps bold in segment html without block wrappers', () => {
    const map = buildPlainTextMap('<ul><li><b>Hello</b> world</li></ul>');
    expect(map.segments.some((segment) => segment.html.includes('<b>'))).toBe(true);
    expect(map.segments.every((segment) => !segment.html.includes('<li>'))).toBe(true);
  });

  it('block preserving keeps numbered lists when appending words', () => {
    const baseline = '<ol><li><b>First</b> step</li><li>Second step</li></ol>';
    const current = '<ol><li><b>First</b> step</li><li>Second step updated</li></ol>';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    expect(result.html).toContain('<ol');
    expect(result.html).toContain('list-style-type:decimal');
    expect(result.html).toContain('<b>First</b>');
    expect(result.html).toContain('updated');
    expect(result.html).not.toMatch(/<ul[^>]*>/);
  });

  it('block preserving keeps bullets and bold when appending words', () => {
    const baseline = '<ul><li><b>Hello</b> world</li></ul>';
    const current = '<ul><li><b>Hello</b> world, mate</li></ul>';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    expect(result.html).toContain('<b>Hello</b>');
    expect(result.html).toContain('<ul');
    expect(result.html).toContain('<li');
    expect(result.html).toContain('mate');
    expect(result.html).not.toContain(
      `<span style="${REDLINE_STYLES.delete}"><b>Hello</b> world</span>`,
    );
  });

  it('inline diff path preserves formatting when using renderPreservingHtml', () => {
    const baseline = '<ul><li><b>Hello</b> world</li></ul>';
    const current = '<ul><li><b>Hello</b> world, mate</li></ul>';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
      inlineDiff: true,
    });

    expect(result.html).toContain('<b>Hello</b>');
    expect(result.html).toContain('mate');
    expect(result.html).not.toContain(
      `<span style="${REDLINE_STYLES.delete}"><b>Hello</b> world</span>`,
    );
  });

  it('show-redline style full-body flow preserves numbered lists and paragraph spacing', () => {
    const baseline = `
      <ol style="margin-top:0;margin-bottom:0;">
        <li style="margin-bottom:6pt;"><b>First</b> item</li>
        <li style="margin-bottom:6pt;">Second item</li>
      </ol>
      <p style="margin-bottom:12pt;line-height:115%;">Closing paragraph.</p>
    `;
    const current = `
      <ol style="margin-top:0;margin-bottom:0;">
        <li style="margin-bottom:6pt;"><b>First</b> item</li>
        <li style="margin-bottom:6pt;">Second item revised</li>
      </ol>
      <p style="margin-bottom:12pt;line-height:115%;">Closing paragraph.</p>
    `;

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    expect(result.html).toContain('<ol');
    expect(result.html).toContain('list-style-type:decimal');
    expect(result.html).toContain('<b>First</b>');
    expect(result.html).toContain('margin-bottom:6pt');
    expect(result.html).toContain('margin-bottom:12pt');
    expect(result.html).toContain('line-height:115%');
    expect(result.html).toContain('revised');
  });

  it('full-body outlook-like email keeps greeting list link styles with localized diff', () => {
    const baseline = `
      <p style="margin-bottom:12pt;font-family:Calibri,sans-serif;">Hi Chris,</p>
      <p style="margin-bottom:12pt;">Thanks for your note.</p>
      <p style="margin-bottom:12pt;">Dear James,</p>
      <ol style="margin-top:0;margin-bottom:0;">
        <li style="margin-bottom:6pt;">We will circulate a short information request.</li>
        <li style="margin-bottom:6pt;">Arcadian will provide an initial document pack.</li>
      </ol>
      <p style="margin-bottom:12pt;"><a href="https://example.com">Here we go</a></p>
      <p style="margin-bottom:12pt;">Best, Bhavya</p>
    `;
    const current = baseline.replace(
      'Arcadian will provide an initial document pack.',
      'Arcadian will provide an updated document pack.',
    );

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    expect(result.html).toContain('font-family:Calibri');
    expect(result.html).toContain('<ol');
    expect(result.html).toContain('list-style-type:decimal');
    expect(result.html).toContain('margin-bottom:12pt');
    expect(result.html).toContain('Here we go');
    expect(result.html).toContain('updated');
    expect(result.html).toContain('color:blue');

    const deleted = result.parts
      .filter((part) => part.op === 'delete')
      .map((part) => part.value)
      .join('');
    expect(deleted).toContain('initial');
    expect(deleted).not.toContain('Hi Chris');
  });

  it('keeps baseline styling when contenteditable strips tags from current html', () => {
    const baseline = '<ul><li><b>Hello</b> world</li></ul>';
    const current = 'Hello world, mate';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    expect(result.html).toContain('<b>Hello</b>');
    expect(result.html).toContain('mate');
  });
});
