import { diffChars, diffWordsWithSpace } from 'diff';
import type { DiffPart } from './types';

const CHAR_DIFF_THRESHOLD = 40;
/**
 * Below this ratio of changed characters, the overall text change is considered
 * localized — use word+char refinement rather than raw word diff.
 */
const LOCALIZED_CHANGE_RATIO = 0.18;
/**
 * Within a changed word pair, below this ratio the change looks like a typo
 * (single/double char substitution) → drill down to char-level diff.
 * Higher than LOCALIZED_CHANGE_RATIO: a 7-char word with one transposed letter
 * has 2/7 ≈ 28 % which should still get char-level treatment.
 */
const WORD_PAIR_TYPO_RATIO = 0.35;
/** Word tokens this length or shorter always use char-level diff (short words, numbers, codes). */
const SHORT_TOKEN_CHAR_DIFF_MAX = 5;

function mapChange(part: { added?: boolean; removed?: boolean; value: string }): DiffPart {
  if (part.added) {
    return { op: 'insert', value: part.value };
  }
  if (part.removed) {
    return { op: 'delete', value: part.value };
  }
  return { op: 'equal', value: part.value };
}

function mapChanges(
  changes: Array<{ added?: boolean; removed?: boolean; value: string }>,
): DiffPart[] {
  return changes.map(mapChange);
}

/** Share of characters that differ — small values mean a localized edit. */
export function changedCharRatio(oldText: string, newText: string): number {
  const changes = diffChars(oldText, newText);
  const changedChars = changes
    .filter((part) => part.added || part.removed)
    .reduce((sum, part) => sum + part.value.length, 0);
  return changedChars / Math.max(oldText.length, newText.length, 1);
}

function isLocalizedChange(oldText: string, newText: string): boolean {
  if (oldText.length < CHAR_DIFF_THRESHOLD && newText.length < CHAR_DIFF_THRESHOLD) {
    return true;
  }
  if (newText.startsWith(oldText) || oldText.startsWith(newText)) {
    return true;
  }
  return changedCharRatio(oldText, newText) <= LOCALIZED_CHANGE_RATIO;
}

/** Char-level diff within a replaced word pair when the edit looks like a typo, not a swap. */
function shouldCharDiffWordPair(oldToken: string, newToken: string): boolean {
  if (oldToken === newToken) {
    return false;
  }
  if (oldToken.startsWith(newToken) || newToken.startsWith(oldToken)) {
    return true;
  }

  const maxLen = Math.max(oldToken.length, newToken.length);
  if (maxLen <= SHORT_TOKEN_CHAR_DIFF_MAX && !/\s/.test(`${oldToken}${newToken}`)) {
    return true;
  }

  return changedCharRatio(oldToken, newToken) <= WORD_PAIR_TYPO_RATIO;
}

function refineWordPair(oldToken: string, newToken: string): DiffPart[] {
  if (oldToken === newToken) {
    return [{ op: 'equal', value: oldToken }];
  }
  if (shouldCharDiffWordPair(oldToken, newToken)) {
    return mapChanges(diffChars(oldToken, newToken));
  }
  return [
    { op: 'delete', value: oldToken },
    { op: 'insert', value: newToken },
  ];
}

function refineChangeGroup(removed: string[], added: string[]): DiffPart[] {
  const parts: DiffPart[] = [];
  const pairs = Math.max(removed.length, added.length);

  for (let i = 0; i < pairs; i++) {
    const oldToken = removed[i] ?? '';
    const newToken = added[i] ?? '';
    if (oldToken && newToken) {
      parts.push(...refineWordPair(oldToken, newToken));
    } else if (oldToken) {
      parts.push({ op: 'delete', value: oldToken });
    } else if (newToken) {
      parts.push({ op: 'insert', value: newToken });
    }
  }

  return parts;
}

/**
 * Word-aligned diff with char-level refinement inside each changed token.
 * Avoids LCS "stutter" (e.g. Stuart→James showing a shared "a" as unchanged).
 */
function refineWordDiff(oldText: string, newText: string): DiffPart[] {
  const raw = diffWordsWithSpace(oldText, newText);
  const parts: DiffPart[] = [];
  let index = 0;

  while (index < raw.length) {
    const part = raw[index];
    if (!part.removed && !part.added) {
      parts.push({ op: 'equal', value: part.value });
      index++;
      continue;
    }

    const removed: string[] = [];
    const added: string[] = [];
    while (index < raw.length && (raw[index].removed || raw[index].added)) {
      if (raw[index].removed) {
        removed.push(raw[index].value);
      }
      if (raw[index].added) {
        added.push(raw[index].value);
      }
      index++;
    }

    parts.push(...refineChangeGroup(removed, added));
  }

  return parts;
}

/**
 * Diff plain text with granularity suited to legal prose:
 * - word-aligned + char refinement for localized edits (typo-safe, no shared-letter stutter)
 * - word level for broader edits (avoids whole-sentence false positives from abbreviations)
 */
export function computeDiff(oldText: string, newText: string): DiffPart[] {
  if (oldText === newText) {
    return [{ op: 'equal', value: oldText }];
  }

  if (newText.startsWith(oldText) || oldText.startsWith(newText)) {
    return mapChanges(diffWordsWithSpace(oldText, newText));
  }

  if (
    (oldText.length < CHAR_DIFF_THRESHOLD && newText.length < CHAR_DIFF_THRESHOLD) ||
    isLocalizedChange(oldText, newText)
  ) {
    return refineWordDiff(oldText, newText);
  }

  const wordParts = mapChanges(diffWordsWithSpace(oldText, newText));
  const deletedChars = wordParts
    .filter((part) => part.op === 'delete')
    .reduce((sum, part) => sum + part.value.length, 0);

  if (deletedChars > 0 && deletedChars >= oldText.length * 0.45) {
    return refineWordDiff(oldText, newText);
  }

  return wordParts;
}

export function hasChanges(parts: DiffPart[]): boolean {
  return parts.some((part) => part.op !== 'equal');
}
