// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildRedline } from '../redline';
import { buildBlockPreservingRedline, extractHtmlBlocks } from '../redline/htmlBlocks';
import { REDLINE_STYLES } from '../redline/types';

function hasWholeBlockDelete(html: string, text: string): boolean {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `<span style="${REDLINE_STYLES.delete.replace(/;/g, ';?')}">${escaped.slice(0, 40)}`,
  ).test(html);
}

describe('block alignment regression — word-level not sentence-level', () => {
  const bases =
    'Subject to any comments from your side, we suggest proceeding on the following bases:';
  const revised = `${bases}, as you wish:`;

  it('localizes a trailing phrase edit in a paired paragraph', () => {
    const baseline = `<p>${bases}</p>`;
    const current = `<p>${revised}</p>`;

    const result = buildBlockPreservingRedline(baseline, current);
    expect(result).not.toBeNull();
    expect(result!.html).toContain('as you wish');
    expect(hasWholeBlockDelete(result!.html, bases)).toBe(false);
  });

  it('localizes edits when a spacer paragraph disappears (Outlook drift)', () => {
    const baseline = `<p>Dear James,</p><p>&nbsp;</p><p>${bases}</p>`;
    const current = `<p>Dear James,</p><p>${revised}</p>`;

    const oldBlocks = extractHtmlBlocks(baseline);
    const newBlocks = extractHtmlBlocks(current);
    expect(oldBlocks.length).not.toBe(newBlocks.length);

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    expect(result.html).toContain('as you wish');
    expect(hasWholeBlockDelete(result.html, bases)).toBe(false);
  });

  it('localizes edits when an empty paragraph is inserted mid-body', () => {
    const baseline = `<p>Dear James,</p><p>${bases}</p>`;
    const current = `<p>Dear James,</p><p></p><p>${revised}</p>`;

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    expect(result.html).toContain('as you wish');
    expect(hasWholeBlockDelete(result.html, bases)).toBe(false);
  });

  it('localizes edits when Outlook changes p to div', () => {
    const baseline = `<p>${bases}</p>`;
    const current = `<div>${revised}</div>`;

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    expect(result.html).toContain('as you wish');
    expect(hasWholeBlockDelete(result.html, bases)).toBe(false);
  });
});
