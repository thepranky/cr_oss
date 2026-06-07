import { describe, expect, it } from 'vitest';
import { computeDiff, hasChanges } from '../redline/diff';

describe('diff', () => {
  it('detects insert only', () => {
    const parts = computeDiff('Hello world', 'Hello brave world');
    expect(parts).toEqual([
      { op: 'equal', value: 'Hello ' },
      { op: 'insert', value: 'brave ' },
      { op: 'equal', value: 'world' },
    ]);
    expect(hasChanges(parts)).toBe(true);
  });

  it('detects delete only', () => {
    const parts = computeDiff('Hello world', 'Hello');
    expect(parts).toEqual([
      { op: 'equal', value: 'Hello' },
      { op: 'delete', value: ' world' },
    ]);
  });

  it('detects mixed changes', () => {
    const parts = computeDiff('The quick fox', 'A quick brown fox');
    expect(hasChanges(parts)).toBe(true);
    expect(parts.some((p) => p.op === 'insert')).toBe(true);
    expect(parts.some((p) => p.op === 'delete')).toBe(true);
  });

  it('returns equal only when text is unchanged', () => {
    const parts = computeDiff('Same text.', 'Same text.');
    expect(parts).toEqual([{ op: 'equal', value: 'Same text.' }]);
    expect(hasChanges(parts)).toBe(false);
  });

  it('handles punctuation at word boundaries', () => {
    const parts = computeDiff('Wait, stop.', 'Wait, go.');
    expect(hasChanges(parts)).toBe(true);
    expect(computeDiff('', 'New.')).toEqual([{ op: 'insert', value: 'New.' }]);
  });

  it('uses character diff for a single edit inside a long sentence', () => {
    const oldSentence =
      'The parties agree that the consultant shall deliver the final report no later than March 31.';
    const newSentence =
      'The parties agree that the consultant shall deliver the final report no later than March 32.';

    const parts = computeDiff(oldSentence, newSentence);
    const deleted = parts
      .filter((part) => part.op === 'delete')
      .reduce((sum, part) => sum + part.value.length, 0);
    const inserted = parts
      .filter((part) => part.op === 'insert')
      .reduce((sum, part) => sum + part.value.length, 0);

    expect(deleted).toBeLessThan(oldSentence.length);
    expect(inserted).toBeLessThan(newSentence.length);
    expect(parts.some((part) => part.op === 'equal' && part.value.length > 20)).toBe(true);
  });
});
