// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildRedline } from '../redline';
import { buildBlockPreservingRedline, extractHtmlBlocks } from '../redline/htmlBlocks';
import { REDLINE_STYLES } from '../redline/types';

function unwrapRedlineDiv(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<div>([\s\S]*)<\/div>$/i);
  return match ? match[1] : trimmed;
}

describe('track editor redline granularity', () => {
  it('does not replace whole list item when appending words', () => {
    const baseline = '<li>Trying to editor panel now</li>';
    const current = '<li>Trying to editor panel now, good changes mate</li>';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    const display = unwrapRedlineDiv(result.html);
    expect(display).toContain('good changes mate');
    expect(display).not.toContain(
      `<span style="${REDLINE_STYLES.delete}">Trying to editor panel now</span>`,
    );
    expect(display.match(/<li/g)?.length).toBe(1);
  });

  it('handles ul-wrapped baseline from Outlook selection', () => {
    const baseline = '<ul><li>Trying to editor panel now</li></ul>';
    const current = '<ul><li>Trying to editor panel now, good changes mate</li></ul>';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    const display = unwrapRedlineDiv(result.html);
    expect(display.match(/<li/g)?.length).toBe(1);
    expect(display).toContain('color:blue');
    expect(display).not.toMatch(
      new RegExp(
        `<span style="${REDLINE_STYLES.delete.replace(/;/g, ';?')}">Trying to editor panel now</span>`,
      ),
    );
  });

  it('reports block counts for contenteditable drift scenarios', () => {
    const scenarios = [
      ['<li>Trying to editor panel now</li>', 'Trying to editor panel now, good changes mate'],
      ['Trying to editor panel now', 'Trying to editor panel now, good changes mate'],
      [
        '<ul><li>Trying to editor panel now</li></ul>',
        '<div>Trying to editor panel now, good changes mate</div>',
      ],
    ] as const;

    for (const [baseline, current] of scenarios) {
      const oldBlocks = extractHtmlBlocks(baseline);
      const newBlocks = extractHtmlBlocks(current);
      const blockResult = buildBlockPreservingRedline(baseline, current);
      expect(oldBlocks.length, `old blocks for ${baseline}`).toBeGreaterThan(0);
      expect(newBlocks.length, `new blocks for ${current}`).toBeGreaterThan(0);
      expect(blockResult?.html).not.toContain(
        `<span style="${REDLINE_STYLES.delete}">Trying to editor panel now</span>`,
      );
    }
  });

  it('localizes edits when contenteditable splits one list item into two blocks', () => {
    const baseline = '<li>Trying to editor panel now</li>';
    const current = '<li>Trying to editor panel now,</li><li> good changes mate</li>';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    const display = unwrapRedlineDiv(result.html);
    expect(display).not.toContain(
      `<span style="${REDLINE_STYLES.delete}">Trying to editor panel now</span>`,
    );
    expect(display).toContain('good changes mate');
    expect(display.match(/<li/g)?.length).toBe(1);
  });

  it('uses inline diff in the track-changes editor without replacing whole list items', () => {
    const baseline = '<li>Trying to editor panel now</li>';
    const current = '<li>Trying to editor panel now, good changes mate</li>';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
      inlineDiff: true,
    });

    const display = unwrapRedlineDiv(result.html);
    expect(display).toContain('Trying to editor panel now');
    expect(display).toContain('good changes mate');
    expect(display).not.toContain(
      `<span style="${REDLINE_STYLES.delete}">Trying to editor panel now</span>`,
    );
  });

  it('matches user-visible whole-sentence delete when block counts differ 1:1 via variable alignment', () => {
    const baseline = '<p>Trying to editor panel now</p>';
    const current = '<li>Trying to editor panel now, good changes mate</li>';

    const oldBlocks = extractHtmlBlocks(baseline);
    const newBlocks = extractHtmlBlocks(current);
    expect(oldBlocks.length).toBe(1);
    expect(newBlocks.length).toBe(1);

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    const display = unwrapRedlineDiv(result.html);
    expect(display).not.toContain(
      `<span style="${REDLINE_STYLES.delete}">Trying to editor panel now</span>`,
    );
  });
});
