import {
  extractHtmlBlocks,
  groupListBlocks,
  groupedBlockFrom,
  unwrapRedundantListWrapper,
  wrapBlock,
  type GroupedBlockHtml,
  type HtmlBlock,
} from '../redline/htmlBlocks';
import { finalizeBodyHtml } from '../redline/bodyEnvelope';
import {
  buildInlinePlainTextMap,
  buildPlainTextMap,
  sliceMapRange,
} from '../redline/htmlPlainMap';
import { normalizePlainTextLineEndings } from '../redline/normalize';
import type { SelectionAnchors } from '../redline/types';

const ANCHOR_LEN = 48;
const REGION_HINT_WINDOW = 512;

export interface CaptureSelectionOptions {
  bodyHtml?: string;
  selectionHtml?: string;
}

const BULLET_LINE_PREFIX =
  /^[\t \u00a0]*(?:[•\u2022\u2023\u25E6\u2043\u25AA\u25CF*\-]|\d+[.)])\s+/;

export type { SelectionAnchors };

export interface LocatedRegion {
  start: number;
  end: number;
}

interface BlockRange {
  block: HtmlBlock;
  start: number;
  end: number;
}

function normalizeLineForMatch(line: string): string {
  return line
    .replace(/\u00a0/g, ' ')
    .replace(BULLET_LINE_PREFIX, '')
    .trimEnd();
}

/** Normalize text for fuzzy selection matching (bullets, line endings). */
function normalizeForSelectionMatch(text: string): string {
  return normalizePlainTextLineEndings(text.trim())
    .split('\n')
    .map((line) => normalizeLineForMatch(line))
    .join('\n');
}

/**
 * Find a selection region in body plain text.
 * Outlook text coercion often includes bullet prefixes and CRLF that differ from HTML plain-text maps.
 */
export function locateSelectionInPlainText(
  bodyPlainText: string,
  selectionPlainText: string,
): LocatedRegion | null {
  const selection = selectionPlainText.trim();
  if (!selection) {
    return null;
  }

  const body = normalizePlainTextLineEndings(bodyPlainText);

  const exactIdx = body.indexOf(selection);
  if (exactIdx !== -1) {
    return { start: exactIdx, end: exactIdx + selection.length };
  }

  const selectionNorm = normalizePlainTextLineEndings(selection);
  const lineEndingIdx = body.indexOf(selectionNorm);
  if (lineEndingIdx !== -1) {
    return { start: lineEndingIdx, end: lineEndingIdx + selectionNorm.length };
  }

  const target = normalizeForSelectionMatch(selection);
  if (!target) {
    return null;
  }

  // Normalization only shortens text (removes bullet prefixes, trims). So the
  // slice that normalizes to `target` must be at least target.length chars long.
  // Cap the inner loop at target.length + per-line fuzz to avoid O(n³).
  const fuzz = target.split('\n').length * 20 + 20;
  for (let start = 0; start < body.length; start++) {
    const maxEnd = Math.min(body.length, start + target.length + fuzz);
    for (let end = start + target.length; end <= maxEnd; end++) {
      if (normalizeForSelectionMatch(body.slice(start, end)) === target) {
        return { start, end };
      }
    }
  }

  return null;
}

function regionKey(region: LocatedRegion): string {
  return `${region.start}:${region.end}`;
}

function addUniqueRegion(regions: LocatedRegion[], seen: Set<string>, start: number, end: number): void {
  if (end <= start) {
    return;
  }
  const key = regionKey({ start, end });
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  regions.push({ start, end });
}

/** Find every plain-text span that matches the selection (exact or normalized). */
export function findAllSelectionRegions(
  bodyPlainText: string,
  selectionPlainText: string,
): LocatedRegion[] {
  const selection = selectionPlainText.trim();
  if (!selection) {
    return [];
  }

  const body = normalizePlainTextLineEndings(bodyPlainText);
  const regions: LocatedRegion[] = [];
  const seen = new Set<string>();

  let idx = 0;
  while (idx < body.length) {
    const found = body.indexOf(selection, idx);
    if (found === -1) {
      break;
    }
    addUniqueRegion(regions, seen, found, found + selection.length);
    idx = found + 1;
  }

  const selectionNorm = normalizePlainTextLineEndings(selection);
  idx = 0;
  while (idx < body.length) {
    const found = body.indexOf(selectionNorm, idx);
    if (found === -1) {
      break;
    }
    addUniqueRegion(regions, seen, found, found + selectionNorm.length);
    idx = found + 1;
  }

  const target = normalizeForSelectionMatch(selection);
  if (target) {
    const fuzz = target.split('\n').length * 20 + 20;
    for (let start = 0; start < body.length; start++) {
      const maxEnd = Math.min(body.length, start + target.length + fuzz);
      for (let end = start + target.length; end <= maxEnd; end++) {
        if (normalizeForSelectionMatch(body.slice(start, end)) === target) {
          addUniqueRegion(regions, seen, start, end);
          break;
        }
      }
    }
  }

  return regions.sort((a, b) => a.start - b.start);
}

function scoreRegionAgainstSelection(
  bodyHtml: string,
  region: LocatedRegion,
  selectionHtml?: string,
  selectionPlain?: string,
): number {
  let score = 0;

  try {
    const extractedHtml = spliceRegionInHtml(bodyHtml, region, 'extract');
    const extractedPlain = buildPlainTextMap(extractedHtml).text;

    if (selectionPlain) {
      if (normalizeForSelectionMatch(extractedPlain) === normalizeForSelectionMatch(selectionPlain)) {
        score += 100;
      }
    }

    if (selectionHtml?.trim()) {
      const selectedPlain = buildPlainTextMap(selectionHtml).text;
      if (normalizeForSelectionMatch(extractedPlain) === normalizeForSelectionMatch(selectedPlain)) {
        score += 120;
      }
      if (extractedHtml.trim() === selectionHtml.trim()) {
        score += 200;
      }
    }
  } catch {
    return score;
  }

  return score;
}

function scoreSelectionRegionCandidate(
  bodyHtml: string | undefined,
  candidate: LocatedRegion,
  selectionHtml?: string,
  selectionPlain?: string,
): number {
  if (!bodyHtml) {
    return 0;
  }
  return scoreRegionAgainstSelection(bodyHtml, candidate, selectionHtml, selectionPlain);
}

function rankSelectionRegionCandidates(
  bodyHtml: string | undefined,
  candidates: LocatedRegion[],
  selectionHtml?: string,
  selectionPlain?: string,
): LocatedRegion[] {
  if (candidates.length <= 1) {
    return candidates;
  }

  return [...candidates].sort(
    (left, right) =>
      scoreSelectionRegionCandidate(bodyHtml, right, selectionHtml, selectionPlain) -
      scoreSelectionRegionCandidate(bodyHtml, left, selectionHtml, selectionPlain),
  );
}

function pickBestSelectionRegion(
  bodyHtml: string | undefined,
  candidates: LocatedRegion[],
  selectionHtml?: string,
  selectionPlain?: string,
): LocatedRegion | null {
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  const ranked = rankSelectionRegionCandidates(bodyHtml, candidates, selectionHtml, selectionPlain);
  const bestScore = scoreSelectionRegionCandidate(bodyHtml, ranked[0], selectionHtml, selectionPlain);
  if (bestScore > 0) {
    return ranked[0];
  }

  return ranked[ranked.length - 1];
}

function pickRegionClosestToHint(candidates: LocatedRegion[], hint: number): LocatedRegion {
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.start - hint) < Math.abs(best.start - hint) ? candidate : best,
  );
}

function regionsMatch(left: LocatedRegion, right: LocatedRegion): boolean {
  return left.start === right.start && left.end === right.end;
}

/** True when prefix/suffix anchors relocate back to the region they were built from. */
function anchorsRoundTrip(body: string, region: LocatedRegion, anchors: SelectionAnchors): boolean {
  const relocated = locateRegionInPlainText(body, anchors);
  return relocated !== null && regionsMatch(relocated, region);
}

/** Score how well a captured region matches Outlook text-coercion selection. */
export function scoreSelectionAgainstBaseline(baselineText: string, selectedText: string): number {
  const selected = selectedText.trim();
  if (!selected) {
    return 0;
  }

  const baseline = normalizeForSelectionMatch(baselineText);
  const target = normalizeForSelectionMatch(selected);
  if (!baseline || !target) {
    return 0;
  }
  if (baseline === target) {
    return 1000 + baseline.length;
  }
  if (baseline.includes(target) || target.includes(baseline)) {
    return 500 + Math.min(baseline.length, target.length);
  }
  return baseline.length;
}

/**
 * Capture selection anchors using both text and HTML coercion.
 * Outlook HTML selection can be a partial fragment; text coercion is the source of truth.
 */
export function captureComposeSelectionAnchors(
  bodyPlainText: string,
  selectedText: string,
  options?: CaptureSelectionOptions,
): SelectionAnchors | null {
  const trimmedText = selectedText.trim();
  if (!trimmedText) {
    return null;
  }

  type Attempt = { plain: string; selectionHtml?: string };
  const attempts: Attempt[] = [{ plain: trimmedText, selectionHtml: options?.selectionHtml }];

  if (options?.selectionHtml?.trim()) {
    const htmlPlain = buildPlainTextMap(options.selectionHtml).text.trim();
    if (htmlPlain && normalizeForSelectionMatch(htmlPlain) !== normalizeForSelectionMatch(trimmedText)) {
      attempts.push({ plain: htmlPlain, selectionHtml: options.selectionHtml });
    }
  }

  let best: SelectionAnchors | null = null;
  let bestScore = -1;

  for (const attempt of attempts) {
    const anchors = captureSelectionAnchors(bodyPlainText, attempt.plain, {
      bodyHtml: options?.bodyHtml,
      selectionHtml: attempt.selectionHtml,
    });
    if (!anchors) {
      continue;
    }

    let score = scoreSelectionAgainstBaseline(anchors.baselineText, trimmedText);

    const relocated = locateRegionInPlainText(bodyPlainText, anchors);
    if (relocated) {
      if (Math.abs(relocated.start - anchors.regionStart) <= 4) {
        score += 250;
      } else {
        score -= 400;
      }
    } else {
      score -= 1000;
    }

    if (options?.bodyHtml) {
      try {
        const extracted = extractRegionHtml(options.bodyHtml, anchors).trim();
        if (
          extracted &&
          scoreSelectionAgainstBaseline(buildPlainTextMap(extracted).text, trimmedText) >= 500
        ) {
          score += 200;
        }
      } catch {
        score -= 300;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = anchors;
    }
  }

  return best;
}

function buildAnchorsFromRegion(body: string, region: LocatedRegion): SelectionAnchors {
  const { start, end } = region;
  return {
    prefix: body.slice(Math.max(0, start - ANCHOR_LEN), start),
    suffix: body.slice(end, Math.min(body.length, end + ANCHOR_LEN)),
    baselineText: body.slice(start, end),
    regionStart: start,
    regionEnd: end,
  };
}

/** True when a candidate region still lines up with the captured prefix/suffix anchors. */
export function regionMatchesAnchors(
  bodyPlainText: string,
  region: LocatedRegion,
  anchors: SelectionAnchors,
): boolean {
  const body = normalizePlainTextLineEndings(bodyPlainText);
  const { start, end } = region;

  if (
    normalizeForSelectionMatch(body.slice(start, end)) !==
    normalizeForSelectionMatch(anchors.baselineText)
  ) {
    return false;
  }

  if (anchors.prefix.length > 0) {
    const actualPrefix = body.slice(Math.max(0, start - anchors.prefix.length), start);
    if (actualPrefix !== anchors.prefix) {
      return false;
    }
  }

  if (anchors.suffix.length > 0) {
    const actualSuffix = body.slice(end, Math.min(body.length, end + anchors.suffix.length));
    if (actualSuffix !== anchors.suffix) {
      return false;
    }
  }

  return true;
}

function bodyPlainTextsEquivalent(left: string, right: string): boolean {
  return normalizePlainTextLineEndings(left) === normalizePlainTextLineEndings(right);
}

function resolveRegionForReplacement(
  bodyPlainText: string,
  anchors: SelectionAnchors,
  captureBodyPlain?: string,
): LocatedRegion | null {
  const body = normalizePlainTextLineEndings(bodyPlainText);
  const hint = anchors.regionStart ?? 0;
  const hintedEnd = anchors.regionEnd ?? hint + anchors.baselineText.length;

  if (
    captureBodyPlain &&
    bodyPlainTextsEquivalent(body, captureBodyPlain) &&
    hintedEnd > hint &&
    regionMatchesAnchors(body, { start: hint, end: hintedEnd }, anchors)
  ) {
    return { start: hint, end: hintedEnd };
  }

  const baselineMatches = findAllSelectionRegions(body, anchors.baselineText);
  if (baselineMatches.length > 0) {
    const validated = baselineMatches.filter((region) => regionMatchesAnchors(body, region, anchors));
    const pool = validated.length > 0 ? validated : baselineMatches;
    return pickRegionClosestToHint(pool, hint);
  }

  const near = locateRegionNearHint(body, anchors);
  if (near && regionMatchesAnchors(body, near, anchors)) {
    return near;
  }

  const global = locateRegionGlobally(body, anchors);
  if (global && regionMatchesAnchors(body, global, anchors)) {
    return global;
  }

  return near ?? global;
}

/** Capture plain-text anchors around a compose selection for later region replacement. */
export function captureSelectionAnchors(
  bodyPlainText: string,
  selectionPlainText: string,
  options?: CaptureSelectionOptions,
): SelectionAnchors | null {
  const body = normalizePlainTextLineEndings(bodyPlainText);
  const candidates = findAllSelectionRegions(body, selectionPlainText);
  if (candidates.length === 0) {
    return null;
  }

  const ranked = rankSelectionRegionCandidates(
    options?.bodyHtml,
    candidates,
    options?.selectionHtml,
    selectionPlainText,
  );
  const selection = selectionPlainText.trim();
  const roundTripCandidates = ranked
    .map((region) => ({ region, anchors: buildAnchorsFromRegion(body, region) }))
    .filter(({ region, anchors }) => anchorsRoundTrip(body, region, anchors))
    .sort((left, right) => {
      const leftExact = body.slice(left.region.start, left.region.end) === selection ? 1 : 0;
      const rightExact = body.slice(right.region.start, right.region.end) === selection ? 1 : 0;
      if (rightExact !== leftExact) {
        return rightExact - leftExact;
      }

      const leftLengthDelta = Math.abs(left.region.end - left.region.start - selection.length);
      const rightLengthDelta = Math.abs(right.region.end - right.region.start - selection.length);
      return leftLengthDelta - rightLengthDelta;
    });

  if (roundTripCandidates.length > 0) {
    return roundTripCandidates[0].anchors;
  }

  const fallback = pickBestSelectionRegion(
    options?.bodyHtml,
    candidates,
    options?.selectionHtml,
    selectionPlainText,
  );
  if (!fallback) {
    return null;
  }

  return buildAnchorsFromRegion(body, fallback);
}

function locateRegionNearHint(body: string, anchors: SelectionAnchors): LocatedRegion | null {
  const hint = anchors.regionStart ?? 0;
  const windowStart = Math.max(0, hint - REGION_HINT_WINDOW);
  const windowEnd = Math.min(
    body.length,
    hint + REGION_HINT_WINDOW + Math.max(anchors.baselineText.length, anchors.suffix.length),
  );

  const candidates: LocatedRegion[] = [];
  let searchFrom = windowStart;

  while (searchFrom <= windowEnd) {
    if (anchors.prefix.length > 0) {
      const prefixIdx = body.indexOf(anchors.prefix, searchFrom);
      if (prefixIdx === -1 || prefixIdx > windowEnd) {
        break;
      }

      const start = prefixIdx + anchors.prefix.length;
      const suffixIdx =
        anchors.suffix.length > 0 ? body.indexOf(anchors.suffix, start) : body.length;

      if (suffixIdx !== -1 && suffixIdx > start && suffixIdx <= windowEnd + anchors.suffix.length) {
        candidates.push({ start, end: suffixIdx });
      }

      searchFrom = prefixIdx + 1;
      continue;
    }

    const start = Math.max(windowStart, Math.min(hint, windowEnd));
    const suffixIdx =
      anchors.suffix.length > 0 ? body.indexOf(anchors.suffix, start) : body.length;

    if (suffixIdx !== -1 && suffixIdx > start) {
      candidates.push({ start, end: suffixIdx });
    }
    break;
  }

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.start - hint) < Math.abs(best.start - hint) ? candidate : best,
  );
}

function locateRegionGlobally(body: string, anchors: SelectionAnchors): LocatedRegion | null {
  const hint = anchors.regionStart ?? 0;
  const candidates: LocatedRegion[] = [];
  let searchFrom = 0;

  while (searchFrom < body.length) {
    if (anchors.prefix.length > 0) {
      const prefixIdx = body.indexOf(anchors.prefix, searchFrom);
      if (prefixIdx === -1) {
        break;
      }

      const start = prefixIdx + anchors.prefix.length;
      const suffixIdx =
        anchors.suffix.length > 0 ? body.indexOf(anchors.suffix, start) : body.length;

      if (suffixIdx !== -1 && suffixIdx > start) {
        candidates.push({ start, end: suffixIdx });
      }

      searchFrom = prefixIdx + 1;
      continue;
    }

    let suffixFrom = searchFrom;
    while (suffixFrom < body.length) {
      const suffixIdx =
        anchors.suffix.length > 0 ? body.indexOf(anchors.suffix, suffixFrom) : body.length;
      if (anchors.suffix.length > 0 && suffixIdx === -1) {
        break;
      }

      const minStart = Math.max(0, suffixIdx - anchors.baselineText.length - 32);
      const start = Math.max(minStart, Math.min(hint, suffixIdx));
      if (suffixIdx > start) {
        candidates.push({ start, end: suffixIdx });
      }

      if (anchors.suffix.length === 0) {
        break;
      }
      suffixFrom = suffixIdx + 1;
    }
    break;
  }

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.start - hint) < Math.abs(best.start - hint) ? candidate : best,
  );
}

/** Locate the originally selected region in the current body plain text. */
export function locateRegionInPlainText(
  bodyPlainText: string,
  anchors: SelectionAnchors,
  options?: { captureBodyPlain?: string },
): LocatedRegion | null {
  return resolveRegionForReplacement(bodyPlainText, anchors, options?.captureBodyPlain);
}

function unwrapRedlineContainer(html: string): string {
  const trimmed = html.trim();
  const divMatch = trimmed.match(/^<div>([\s\S]*)<\/div>$/i);
  return divMatch ? divMatch[1] : trimmed;
}

function advancePlainCursor(plainText: string, cursor: number): number {
  return cursor < plainText.length && plainText[cursor] === '\n' ? cursor + 1 : cursor;
}

function alignBlocksToPlainRangesByIndexOf(blocks: HtmlBlock[], plainText: string): BlockRange[] {
  let cursor = 0;
  const ranges: BlockRange[] = [];

  for (const block of blocks) {
    let start = block.text ? plainText.indexOf(block.text, cursor) : cursor;
    if (start === -1) {
      start = cursor;
    }

    const end = start + block.text.length;
    ranges.push({ block, start, end });
    cursor = advancePlainCursor(plainText, end);
  }

  return ranges;
}

function buildSequentialBlockRanges(blocks: HtmlBlock[], plainText: string): BlockRange[] {
  let cursor = 0;
  const ranges: BlockRange[] = [];

  for (const block of blocks) {
    if (block.isSpacer) {
      const start = cursor;
      let end = start;
      if (plainText[cursor] === '\u00a0') {
        end = cursor + 1;
        cursor = advancePlainCursor(plainText, end);
      } else if (plainText[cursor] === '\n') {
        cursor = advancePlainCursor(plainText, cursor);
      }
      ranges.push({ block, start, end });
      continue;
    }

    const text = block.text;
    if (!text) {
      ranges.push({ block, start: cursor, end: cursor });
      cursor = advancePlainCursor(plainText, cursor);
      continue;
    }

    const found = plainText.indexOf(text, cursor);
    const start = found !== -1 && found - cursor <= 2 ? found : cursor;
    const end = start + text.length;
    ranges.push({ block, start, end });
    cursor = advancePlainCursor(plainText, end);
  }

  return ranges;
}

function validateSequentialBlockRanges(
  ranges: BlockRange[],
  plainText: string,
  blocks: HtmlBlock[],
): boolean {
  if (ranges.length !== blocks.length) {
    return false;
  }

  for (let index = 0; index < ranges.length; index++) {
    const { block, start, end } = ranges[index];
    const slice = plainText.slice(start, end);

    if (block.isSpacer) {
      if (slice !== '\u00a0' && slice !== '') {
        return false;
      }
      continue;
    }

    if (!block.text) {
      continue;
    }

    if (slice === block.text) {
      continue;
    }

    if (slice.replace(/\u00a0/g, ' ') === block.text.replace(/\u00a0/g, ' ')) {
      continue;
    }

    return false;
  }

  return true;
}

/** Map each HTML block to a plain-text span in the body map. */
function alignBlocksToPlainRanges(blocks: HtmlBlock[], plainText: string): BlockRange[] {
  const sequential = buildSequentialBlockRanges(blocks, plainText);
  if (validateSequentialBlockRanges(sequential, plainText, blocks)) {
    return sequential;
  }

  return alignBlocksToPlainRangesByIndexOf(blocks, plainText);
}

function listContextFromOverlappingBlocks(
  blockRanges: BlockRange[],
  region: LocatedRegion,
): HtmlBlock | undefined {
  for (const { block, start, end } of blockRanges) {
    if (end <= region.start || start >= region.end) {
      continue;
    }
    if (block.listType) {
      return block;
    }
  }
  return undefined;
}

function sliceBlockHtmlAtRange(
  block: HtmlBlock,
  blockStart: number,
  sliceStart: number,
  sliceEnd: number,
): string | null {
  const relStart = sliceStart - blockStart;
  const relEnd = sliceEnd - blockStart;

  if (relStart <= 0 && relEnd >= block.text.length) {
    return block.html;
  }
  if (relStart >= relEnd || relEnd <= 0 || relStart >= block.text.length) {
    return null;
  }

  const clampedStart = Math.max(0, relStart);
  const clampedEnd = Math.min(block.text.length, relEnd);
  const inlineMap = buildInlinePlainTextMap(block.innerHtml);
  const inner = sliceMapRange(inlineMap, clampedStart, clampedEnd);
  return wrapBlock(block.tag, inner, block.blockStyle ?? null, block.blockClass ?? null);
}

function replacementToGroupedBlocks(
  replacementHtml: string,
  listContext?: HtmlBlock,
): GroupedBlockHtml[] {
  const inner = unwrapRedundantListWrapper(unwrapRedlineContainer(replacementHtml));
  if (!inner.trim()) {
    return [];
  }

  const blocks = extractHtmlBlocks(`<div>${inner}</div>`);
  if (blocks.length === 0) {
    if (inner.trim().startsWith('<li') && listContext) {
      return [groupedBlockFrom(listContext, inner)];
    }
    return [{ html: inner }];
  }

  return blocks.map((block) => groupedBlockFrom(block, undefined, listContext ?? block));
}

function replaceRegionPreservingBlocks(
  bodyHtml: string,
  region: LocatedRegion,
  replacementHtml: string,
  blockRanges: BlockRange[],
): string {
  const before: GroupedBlockHtml[] = [];
  const after: GroupedBlockHtml[] = [];
  const listContext = listContextFromOverlappingBlocks(blockRanges, region);

  for (const { block, start, end } of blockRanges) {
    if (end <= region.start) {
      before.push(groupedBlockFrom(block));
      continue;
    }

    if (start >= region.end) {
      after.push(groupedBlockFrom(block));
      continue;
    }

    if (start < region.start) {
      const prefix = sliceBlockHtmlAtRange(block, start, start, region.start);
      if (prefix) {
        before.push(groupedBlockFrom(block, prefix));
      }
    }

    if (end > region.end) {
      const suffix = sliceBlockHtmlAtRange(block, start, region.end, end);
      if (suffix) {
        after.push(groupedBlockFrom(block, suffix));
      }
    }
  }

  const replacementBlocks = replacementToGroupedBlocks(replacementHtml, listContext);
  return finalizeBodyHtml(bodyHtml, groupListBlocks([...before, ...replacementBlocks, ...after]));
}

function spliceRegionInHtml(
  bodyHtml: string,
  region: LocatedRegion,
  mode: 'extract' | 'replace',
  replacementHtml?: string,
): string {
  const blocks = extractHtmlBlocks(bodyHtml);
  if (blocks.length === 0) {
    const map = buildPlainTextMap(bodyHtml);
    if (mode === 'extract') {
      return sliceMapRange(map, region.start, region.end);
    }
    const before = sliceMapRange(map, 0, region.start);
    const after = sliceMapRange(map, region.end, map.text.length);
    const inner = unwrapRedlineContainer(replacementHtml ?? '');
    return `${before}${inner}${after}`;
  }

  const map = buildPlainTextMap(bodyHtml);
  const blockRanges = alignBlocksToPlainRanges(blocks, map.text);
  const before: GroupedBlockHtml[] = [];
  const inside: GroupedBlockHtml[] = [];
  const after: GroupedBlockHtml[] = [];
  let overlapsRegion = false;

  for (const { block, start, end } of blockRanges) {
    if (end <= region.start) {
      if (mode === 'replace') {
        before.push(groupedBlockFrom(block));
      }
      continue;
    }

    if (start >= region.end) {
      if (mode === 'replace') {
        after.push(groupedBlockFrom(block));
      }
      continue;
    }

    overlapsRegion = true;

    if (start < region.start) {
      const prefix = sliceBlockHtmlAtRange(block, start, start, region.start);
      if (prefix && mode === 'replace') {
        before.push(groupedBlockFrom(block, prefix));
      }
    }

    if (end > region.end) {
      const suffix = sliceBlockHtmlAtRange(block, start, region.end, end);
      if (suffix && mode === 'replace') {
        after.push(groupedBlockFrom(block, suffix));
      }
    }

    if (mode === 'extract') {
      const innerStart = Math.max(start, region.start);
      const innerEnd = Math.min(end, region.end);
      if (innerStart < innerEnd) {
        const inner = sliceBlockHtmlAtRange(block, start, innerStart, innerEnd);
        if (inner) {
          inside.push(groupedBlockFrom(block, inner));
        }
      }
    }
  }

  if (mode === 'extract') {
    return groupListBlocks(inside);
  }

  if (!overlapsRegion) {
    const sequentialRanges = buildSequentialBlockRanges(blocks, map.text);
    if (validateSequentialBlockRanges(sequentialRanges, map.text, blocks)) {
      return replaceRegionPreservingBlocks(
        bodyHtml,
        region,
        replacementHtml ?? '',
        sequentialRanges,
      );
    }
  }

  const listContext = listContextFromOverlappingBlocks(blockRanges, region);
  const replacementBlocks = replacementHtml
    ? replacementToGroupedBlocks(replacementHtml, listContext)
    : [];
  return finalizeBodyHtml(bodyHtml, groupListBlocks([...before, ...replacementBlocks, ...after]));
}

export interface ReplaceRegionOptions {
  /** Plain-text map captured at Bring to Editor / Start Tracking for unchanged drafts. */
  captureBodyPlain?: string;
}

export function extractRegionHtml(
  bodyHtml: string,
  anchors: SelectionAnchors,
  options?: ReplaceRegionOptions,
): string {
  const map = buildPlainTextMap(bodyHtml);
  const region = locateRegionInPlainText(map.text, anchors, options);
  if (!region) {
    throw new Error('Could not locate the original selection in the draft.');
  }
  return spliceRegionInHtml(bodyHtml, region, 'extract');
}

export function replaceRegionInHtml(
  bodyHtml: string,
  anchors: SelectionAnchors,
  replacementHtml: string,
  options?: ReplaceRegionOptions,
): string {
  const map = buildPlainTextMap(bodyHtml);
  const region = locateRegionInPlainText(map.text, anchors, options);
  if (!region) {
    throw new Error('Could not locate the original selection in the draft.');
  }
  return spliceRegionInHtml(bodyHtml, region, 'replace', replacementHtml);
}
