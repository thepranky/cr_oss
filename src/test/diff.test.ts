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

  it('marks only appended words when text grows at the end', () => {
    const parts = computeDiff(
      'Trying to editor panel now',
      'Trying to editor panel now, good changes mate',
    );

    expect(parts).toEqual([
      { op: 'equal', value: 'Trying to editor panel now' },
      { op: 'insert', value: ', good changes mate' },
    ]);
  });

  it('replaces a whole word instead of matching shared letters (Stuart→James)', () => {
    const oldText =
      'Further to our call earlier today, Dear Stuart, we suggest proceeding on the following bases:';
    const newText = oldText.replace('Stuart', 'James');

    const parts = computeDiff(oldText, newText);
    expect(parts).toEqual([
      { op: 'equal', value: 'Further to our call earlier today, Dear ' },
      { op: 'delete', value: 'Stuart' },
      { op: 'insert', value: 'James' },
      { op: 'equal', value: ', we suggest proceeding on the following bases:' },
    ]);
  });

  it('still char-differs inside similar words (Arcadian→Arcadia)', () => {
    const parts = computeDiff('Dear Arcadian,', 'Dear Arcadia,');
    expect(parts.some((part) => part.op === 'delete' && part.value === 'n')).toBe(true);
    expect(parts.some((part) => part.op === 'delete' && part.value === 'Arcadian')).toBe(false);
  });

  it('still char-differs short numeric tokens (31→32)', () => {
    const oldSentence =
      'The parties agree that the consultant shall deliver the final report no later than March 31.';
    const newSentence = oldSentence.replace('31', '32');

    const parts = computeDiff(oldSentence, newSentence);
    expect(parts).toEqual([
      {
        op: 'equal',
        value: 'The parties agree that the consultant shall deliver the final report no later than March ',
      },
      { op: 'equal', value: '3' },
      { op: 'delete', value: '1' },
      { op: 'insert', value: '2' },
      { op: 'equal', value: '.' },
    ]);
  });
});
