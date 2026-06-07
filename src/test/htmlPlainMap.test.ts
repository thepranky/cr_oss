// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildRedline } from '../redline';
import { computeDiff } from '../redline/diff';
import {
  buildInlinePlainTextMap,
  sliceMapRange,
  wrapConsecutiveListItems,
} from '../redline/htmlPlainMap';
import { renderPreservingHtml } from '../redline/renderPreserving';

describe('htmlPlainMap', () => {
  it('wrapConsecutiveListItems groups li elements in a ul', () => {
    const html = '<li>One</li><li>Two</li>';
    expect(wrapConsecutiveListItems(html)).toBe('<ul><li>One</li><li>Two</li></ul>');
  });

  it('sliceMapRange returns full segment html for aligned ranges', () => {
    const map = {
      text: 'Hello world',
      segments: [{ start: 0, end: 11, html: '<p><b>Hello world</b></p>' }],
    };
    expect(sliceMapRange(map, 0, 11)).toBe('<p><b>Hello world</b></p>');
  });

  it('buildInlinePlainTextMap does not wrap segments in synthetic div tags', () => {
    const map = buildInlinePlainTextMap('<b>The parties agree</b> to the terms.');
    expect(map.segments[0]?.html).toBe('<b>The parties agree</b>');
    expect(map.segments[0]?.html).not.toContain('<div>');
  });

  it('preserves inline tags for partial overlap slices', () => {
    const map = {
      text: 'Hello',
      segments: [{ start: 0, end: 5, html: '<b>Hello</b>' }],
    };
    expect(sliceMapRange(map, 1, 4)).toBe('<b>ell</b>');
  });
});

describe('renderPreservingHtml', () => {
  it('keeps formatting on unchanged runs and marks inserts', () => {
    const baselineMap = {
      text: 'Hello world',
      segments: [
        { start: 0, end: 6, html: '<b>Hello </b>' },
        { start: 6, end: 11, html: '<b>world</b>' },
      ],
    };
    const currentMap = {
      text: 'Hello brave world',
      segments: [
        { start: 0, end: 6, html: '<b>Hello </b>' },
        { start: 6, end: 12, html: '<b>brave </b>' },
        { start: 12, end: 17, html: '<b>world</b>' },
      ],
    };

    const parts = computeDiff(baselineMap.text, currentMap.text);
    const html = renderPreservingHtml(parts, baselineMap, currentMap);

    expect(html).toContain('<b>Hello </b>');
    expect(html).toContain('color:blue');
    expect(html).toContain('brave');
  });

  it('preserves list item structure for unchanged list text', () => {
    const baselineMap = {
      text: 'First\nSecond\n',
      segments: [
        { start: 0, end: 6, html: '<li>First</li>' },
        { start: 6, end: 13, html: '<li>Second</li>' },
      ],
    };
    const currentMap = {
      text: 'First\nSecond item\n',
      segments: [
        { start: 0, end: 6, html: '<li>First</li>' },
        { start: 6, end: 17, html: '<li>Second item</li>' },
      ],
    };
    const parts = computeDiff(baselineMap.text, currentMap.text);
    const html = renderPreservingHtml(parts, baselineMap, currentMap);

    expect(html).toContain('<ul>');
    expect(html).toContain('<li>First</li>');
    expect(html).toContain('color:blue');
  });
});

describe('buildRedline formatting preservation', () => {
  it('keeps baseline styling on inserts and unchanged text when current is plain', () => {
    const baseline = '<p><span style="font-weight:bold">The parties agree</span> to the terms.</p>';
    const current = '<p>The parties agree to the revised terms.</p>';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
    });

    expect(result.html).not.toContain('<div>The parties agree</div>');
    expect(result.html).toContain('font-weight:bold');
    expect(result.html).toContain('revised');
    expect(result.html).toContain('color:blue');
  });

  it('avoids whole-sentence replacements for localized edits in long text', () => {
    const oldText =
      'The parties hereby agree that the consultant shall perform the services described herein. Wait, stop. The consultant shall deliver the final report.';
    const newText = oldText.replace('stop', 'go');

    const parts = computeDiff(oldText, newText);
    const deleted = parts
      .filter((part) => part.op === 'delete')
      .map((part) => part.value)
      .join('');

    expect(deleted).not.toContain('Wait, stop.');
    expect(deleted.length).toBeLessThan(10);
  });
});
