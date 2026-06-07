import { diffChars, diffWordsWithSpace } from 'diff';
import type { DiffPart } from './types';

const CHAR_DIFF_THRESHOLD = 40;
/** Below this ratio of changed characters, prefer char-level diff in long text. */
const LOCALIZED_CHANGE_RATIO = 0.18;

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
  return changedCharRatio(oldText, newText) <= LOCALIZED_CHANGE_RATIO;
}

/**
 * Diff plain text with granularity suited to legal prose:
 * - char level for short or localized edits (single typo in a long sentence)
 * - word level for broader edits (avoids whole-sentence false positives from abbreviations)
 */
export function computeDiff(oldText: string, newText: string): DiffPart[] {
  if (oldText === newText) {
    return [{ op: 'equal', value: oldText }];
  }

  if (oldText.length < CHAR_DIFF_THRESHOLD && newText.length < CHAR_DIFF_THRESHOLD) {
    return mapChanges(diffChars(oldText, newText));
  }

  if (isLocalizedChange(oldText, newText)) {
    return mapChanges(diffChars(oldText, newText));
  }

  return mapChanges(diffWordsWithSpace(oldText, newText));
}

export function hasChanges(parts: DiffPart[]): boolean {
  return parts.some((part) => part.op !== 'equal');
}
