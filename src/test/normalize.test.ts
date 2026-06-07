import { describe, expect, it } from 'vitest';
import {
  decodeHtmlEntities,
  htmlToPlainText,
  normalizeForDiff,
  normalizePlainText,
} from '../redline/normalize';

describe('normalize', () => {
  it('strips inline HTML tags', () => {
    expect(htmlToPlainText('<p>Hello <b>world</b></p>')).toBe('Hello world\n');
  });

  it('preserves paragraph breaks as newlines', () => {
    expect(htmlToPlainText('<p>First</p><p>Second</p>')).toBe('First\nSecond\n');
  });

  it('converts br tags to newlines', () => {
    expect(htmlToPlainText('Line one<br>Line two')).toBe('Line one\nLine two');
  });

  it('decodes HTML entities including nbsp', () => {
    expect(decodeHtmlEntities('foo&nbsp;bar &amp; baz')).toBe('foo bar & baz');
    expect(htmlToPlainText('<p>Hi&nbsp;there</p>')).toBe('Hi there\n');
  });

  it('normalizes plain text line endings', () => {
    expect(normalizePlainText('a\r\nb')).toBe('a\nb');
  });

  it('normalizeForDiff handles html flag', () => {
    expect(normalizeForDiff('<p>Test</p>', true)).toBe('Test\n');
    expect(normalizeForDiff('Plain', false)).toBe('Plain');
  });
});
