import { diffArrays } from 'diff';
import type { FormattingContext } from './dominantStyle';
import { changedCharRatio, computeDiff } from './diff';
import {
  buildInlinePlainTextMap,
  resolveInsertHtml,
  sliceMapRange,
  sliceWithFormattingPreference,
} from './htmlPlainMap';
import { escapeHtml, formatTextForHtml } from './render';
import { REDLINE_STYLES, type DiffPart } from './types';

export type ListType = 'ul' | 'ol';

export interface ListWrapperMeta {
  listType: ListType;
  wrapperStyle?: string;
  wrapperClass?: string;
  start?: number;
}

export interface HtmlBlock {
  text: string;
  html: string;
  tag: string;
  innerHtml: string;
  blockStyle?: string;
  blockClass?: string;
  isSpacer?: boolean;
  listType?: ListType;
  listWrapperStyle?: string;
  listWrapperClass?: string;
  listStart?: number;
}

export interface GroupedBlockHtml {
  html: string;
  listType?: ListType;
  listWrapperStyle?: string;
  listWrapperClass?: string;
  listStart?: number;
}

/** Outlook-friendly list wrapper styles. */
export const EMAIL_LIST_STYLE = 'margin-top:0;margin-bottom:0;padding-left:24px;';

export const EMAIL_UL_STYLE = `${EMAIL_LIST_STYLE}list-style-type:disc;`;

export const EMAIL_OL_STYLE = `${EMAIL_LIST_STYLE}list-style-type:decimal;`;

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

const INLINE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'A', 'FONT']);

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const INHERITED_STYLE_PROPS = [
  'font-family',
  'font-size',
  'color',
  'line-height',
  'mso-ansi-font-size',
  'mso-bidi-font-family',
  'mso-fareast-font-family',
];

function parseStyleDeclarations(style: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const chunk of style.split(';')) {
    const colon = chunk.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const key = chunk.slice(0, colon).trim().toLowerCase();
    const value = chunk.slice(colon + 1).trim();
    if (key && value) {
      declarations.set(key, value);
    }
  }
  return declarations;
}

function collectInheritedStyle(element: Element): string | undefined {
  const merged = new Map<string, string>();
  let el: Element | null = element.parentElement;

  while (el && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
    const style = el.getAttribute('style');
    if (style) {
      for (const prop of INHERITED_STYLE_PROPS) {
        if (!merged.has(prop)) {
          const value = parseStyleDeclarations(style).get(prop);
          if (value) {
            merged.set(prop, value);
          }
        }
      }
    }

    if (el.tagName === 'FONT') {
      const face = el.getAttribute('face');
      if (face && !merged.has('font-family')) {
        merged.set('font-family', face);
      }
    }

    el = el.parentElement;
  }

  if (merged.size === 0) {
    return undefined;
  }

  return INHERITED_STYLE_PROPS.filter((prop) => merged.has(prop))
    .map((prop) => `${prop}:${merged.get(prop)}`)
    .join(';');
}

function hasFontStyling(innerHtml: string, blockStyle?: string): boolean {
  if (blockStyle && /font-family|font-size/i.test(blockStyle)) {
    return true;
  }
  return /font-family|font-size|<font\b/i.test(innerHtml);
}

function applyInheritedFont(
  innerHtml: string,
  inheritedStyle?: string,
  blockStyle?: string,
): string {
  if (!inheritedStyle || hasFontStyling(innerHtml, blockStyle)) {
    return innerHtml;
  }
  return `<span style="${escapeAttr(inheritedStyle)}">${innerHtml}</span>`;
}

function normalizeInlineTag(tag: string): string {
  if (tag === 'STRONG') return 'b';
  if (tag === 'EM') return 'i';
  return tag.toLowerCase();
}

function serializeInlineElement(el: Element): string {
  if (el.tagName === 'FONT') {
    const face = el.getAttribute('face');
    const size = el.getAttribute('size');
    const color = el.getAttribute('color');
    const attrs = [
      face ? ` face="${escapeAttr(face)}"` : '',
      size ? ` size="${escapeAttr(size)}"` : '',
      color ? ` color="${escapeAttr(color)}"` : '',
    ].join('');
    return `<font${attrs}>${serializeElementInner(el)}</font>`;
  }

  const tag = normalizeInlineTag(el.tagName);
  const style = el.getAttribute('style');
  const styleAttr = style ? ` style="${escapeAttr(style)}"` : '';

  if (tag === 'a') {
    const href = el.getAttribute('href');
    const hrefAttr = href ? ` href="${escapeAttr(href)}"` : '';
    return `<a${hrefAttr}${styleAttr}>${serializeElementInner(el)}</a>`;
  }

  return `<${tag}${styleAttr}>${serializeElementInner(el)}</${tag}>`;
}

function serializeElementInner(element: Element): string {
  return Array.from(element.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return escapeHtml(node.textContent ?? '');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }
      const el = node as Element;
      if (el.tagName === 'BR') {
        return '<br>';
      }
      if (INLINE_TAGS.has(el.tagName)) {
        return serializeInlineElement(el);
      }
      return serializeElementInner(el);
    })
    .join('');
}

function isSpacerBlock(element: Element): boolean {
  if (element.tagName === 'LI') {
    return false;
  }

  const text = (element.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  if (text) {
    return false;
  }

  const html = element.innerHTML.toLowerCase();
  return html.includes('<br') || html.includes('&nbsp;') || html.trim() === '';
}

function spacerInnerHtml(element: Element): string {
  const html = element.innerHTML.trim();
  if (html.toLowerCase().includes('<br')) {
    return '<br>';
  }
  return '&nbsp;';
}

function extractListWrapperMeta(element: Element, listType: ListType): ListWrapperMeta {
  const startAttr = element.getAttribute('start');
  const start = startAttr ? Number.parseInt(startAttr, 10) : undefined;

  return {
    listType,
    wrapperStyle: element.getAttribute('style') ?? undefined,
    wrapperClass: element.getAttribute('class') ?? undefined,
    start: start !== undefined && !Number.isNaN(start) ? start : undefined,
  };
}

function pushBlock(
  element: Element,
  blocks: HtmlBlock[],
  listType?: ListType,
  listWrapper?: ListWrapperMeta,
) {
  const tag = element.tagName.toLowerCase();
  const blockStyle = element.getAttribute('style') ?? undefined;
  const blockClass = element.getAttribute('class') ?? undefined;
  const isSpacer = isSpacerBlock(element);
  const text = isSpacer ? '\u00a0' : (element.textContent ?? '');

  if (!text.trim() && tag !== 'li' && !isSpacer) {
    return;
  }

  const rawInner = isSpacer ? spacerInnerHtml(element) : serializeElementInner(element);
  const inheritedStyle = collectInheritedStyle(element);
  const innerHtml = applyInheritedFont(rawInner, inheritedStyle, blockStyle);
  const html = wrapBlock(tag, innerHtml, blockStyle, blockClass);

  blocks.push({
    text,
    tag,
    innerHtml,
    blockStyle,
    blockClass,
    isSpacer,
    listType: tag === 'li' ? listType : undefined,
    listWrapperStyle: tag === 'li' ? listWrapper?.wrapperStyle : undefined,
    listWrapperClass: tag === 'li' ? listWrapper?.wrapperClass : undefined,
    listStart: tag === 'li' ? listWrapper?.start : undefined,
    html,
  });
}

function hasDirectBlockChildren(element: Element): boolean {
  for (const child of element.children) {
    if (
      BLOCK_TAGS.has(child.tagName) ||
      child.tagName === 'OL' ||
      child.tagName === 'UL'
    ) {
      return true;
    }
  }
  return false;
}

function extractBlocksFromNode(node: Node, blocks: HtmlBlock[]): void {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  const tag = element.tagName;

  if (tag === 'UL' || tag === 'OL') {
    const listType: ListType = tag === 'OL' ? 'ol' : 'ul';
    const listWrapper = extractListWrapperMeta(element, listType);
    for (const child of element.children) {
      if (child.tagName === 'LI') {
        pushBlock(child, blocks, listType, listWrapper);
        continue;
      }
      if (child.tagName === 'OL' || child.tagName === 'UL') {
        extractBlocksFromNode(child, blocks);
      }
    }
    return;
  }

  if (BLOCK_TAGS.has(tag)) {
    if (tag !== 'LI' && hasDirectBlockChildren(element)) {
      for (const child of element.childNodes) {
        extractBlocksFromNode(child, blocks);
      }
      return;
    }
    pushBlock(element, blocks);
    return;
  }

  for (const child of element.childNodes) {
    extractBlocksFromNode(child, blocks);
  }
}

/** Peel redundant nested list wrappers produced by some region redline paths. */
export function unwrapRedundantListWrapper(html: string): string {
  let trimmed = html.trim();

  for (let depth = 0; depth < 4; depth++) {
    const match = trimmed.match(/^<(ol|ul)\b[^>]*>([\s\S]*)<\/\1>$/i);
    if (!match) {
      break;
    }

    const inner = match[2].trim();
    if (!/^<(ol|ul)\b/i.test(inner)) {
      break;
    }

    trimmed = inner;
  }

  return trimmed;
}

/** Split HTML into block-level units (list items, paragraphs) for stable list redlines. */
export function extractHtmlBlocks(html: string): HtmlBlock[] {
  if (!html.trim() || typeof DOMParser === 'undefined') {
    return [];
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: HtmlBlock[] = [];

  for (const child of doc.body.childNodes) {
    extractBlocksFromNode(child, blocks);
  }

  const bodyText = doc.body.textContent ?? '';
  if (blocks.length === 0 && bodyText.trim()) {
    const innerHtml = serializeElementInner(doc.body);
    const blockStyle = doc.body.getAttribute('style') ?? undefined;
    blocks.push({
      text: bodyText,
      tag: 'p',
      innerHtml,
      blockStyle,
      html: wrapBlock('p', innerHtml, blockStyle, doc.body.getAttribute('class') ?? undefined),
    });
  }

  return blocks;
}

export function wrapBlock(
  tag: string,
  inner: string,
  style?: string | null,
  className?: string | null,
): string {
  const styleAttr = style ? ` style="${escapeAttr(style)}"` : '';
  const classAttr = className ? ` class="${escapeAttr(className)}"` : '';
  return `<${tag}${classAttr}${styleAttr}>${inner}</${tag}>`;
}

function blockPlainTextMap(block: HtmlBlock) {
  return buildInlinePlainTextMap(block.innerHtml);
}

/** Map diff parts back to styled HTML inside a single block. */
function renderStyledInlineDiff(
  parts: DiffPart[],
  oldBlock: HtmlBlock,
  newBlock: HtmlBlock,
  markChanges: boolean,
  formatting?: FormattingContext,
): string {
  if (!markChanges) {
    return newBlock.innerHtml;
  }

  const baselineMap = blockPlainTextMap(oldBlock);
  const currentMap = blockPlainTextMap(newBlock);
  let oldCursor = 0;
  let newCursor = 0;
  let inner = '';

  for (const part of parts) {
    const length = part.value.length;

    switch (part.op) {
      case 'equal': {
        inner += sliceWithFormattingPreference(
          baselineMap,
          currentMap,
          oldCursor,
          oldCursor + length,
          newCursor,
          newCursor + length,
          formatting,
        );
        oldCursor += length;
        newCursor += length;
        break;
      }
      case 'delete': {
        const deleted =
          sliceMapRange(baselineMap, oldCursor, oldCursor + length, formatting) ||
          formatTextForHtml(part.value, formatting?.dominant);
        inner += `<span style="${REDLINE_STYLES.delete}">${deleted}</span>`;
        oldCursor += length;
        break;
      }
      case 'insert': {
        const inserted = resolveInsertHtml(
          baselineMap,
          currentMap,
          oldCursor,
          newCursor,
          newCursor + length,
          part.value,
          formatting,
        );
        inner += `<span style="${REDLINE_STYLES.insert}">${inserted}</span>`;
        newCursor += length;
        break;
      }
    }
  }

  return inner;
}

function renderModifiedBlock(
  oldBlock: HtmlBlock,
  newBlock: HtmlBlock,
  markChanges: boolean,
  formatting?: FormattingContext,
): string {
  const parts = computeDiff(oldBlock.text, newBlock.text);
  const tag = newBlock.tag || oldBlock.tag || 'p';
  const blockStyle = newBlock.blockStyle ?? oldBlock.blockStyle;
  const blockClass = newBlock.blockClass ?? oldBlock.blockClass;
  const inner = renderStyledInlineDiff(parts, oldBlock, newBlock, markChanges, formatting);
  return wrapBlock(tag, inner, blockStyle, blockClass);
}

function listWrapperTag(listType: ListType): string {
  return listType === 'ol' ? 'ol' : 'ul';
}

function listWrapperStyle(listType: ListType): string {
  return listType === 'ol' ? EMAIL_OL_STYLE : EMAIL_UL_STYLE;
}

function ensureListStyleType(style: string, listType: ListType): string {
  if (/list-style-type\s*:/i.test(style)) {
    return style;
  }
  const typeDecl = listType === 'ol' ? 'list-style-type:decimal' : 'list-style-type:disc';
  return style.trim() ? `${style};${typeDecl}` : typeDecl;
}

function openListWrapper(
  listType: ListType,
  wrapperStyle?: string,
  wrapperClass?: string,
  start?: number,
): string {
  const tag = listWrapperTag(listType);
  const style = ensureListStyleType(wrapperStyle?.trim() || listWrapperStyle(listType), listType);
  const classAttr = wrapperClass ? ` class="${escapeAttr(wrapperClass)}"` : '';
  const startAttr = start !== undefined ? ` start="${start}"` : '';
  return `<${tag}${classAttr} style="${escapeAttr(style)}"${startAttr}>`;
}

function toGroupedBlock(block: HtmlBlock, fallback?: HtmlBlock): GroupedBlockHtml {
  return groupedBlockFrom(block, undefined, fallback);
}

/** Build grouped list/block output while preserving list wrapper metadata from extraction. */
export function groupedBlockFrom(
  block: HtmlBlock,
  html?: string,
  fallback?: HtmlBlock,
): GroupedBlockHtml {
  return {
    html: html ?? block.html,
    listType: block.listType ?? fallback?.listType,
    listWrapperStyle: block.listWrapperStyle ?? fallback?.listWrapperStyle,
    listWrapperClass: block.listWrapperClass ?? fallback?.listWrapperClass,
    listStart: block.listStart ?? fallback?.listStart,
  };
}

function resolveListType(
  block: HtmlBlock,
  fallback?: ListType,
): ListType | undefined {
  return block.listType ?? fallback;
}

/** Group consecutive list items into ul/ol wrappers for email clients. */
export function groupListBlocks(blocks: GroupedBlockHtml[]): string {
  const groups: string[] = [];
  let listBuffer: string[] = [];
  let currentListType: ListType = 'ul';
  let currentWrapperStyle: string | undefined;
  let currentWrapperClass: string | undefined;
  let currentListStart: number | undefined;

  const flush = () => {
    if (listBuffer.length > 0) {
      const wrapper = listWrapperTag(currentListType);
      const open = openListWrapper(
        currentListType,
        currentWrapperStyle,
        currentWrapperClass,
        currentListStart,
      );
      groups.push(`${open}${listBuffer.join('')}</${wrapper}>`);
      listBuffer = [];
      currentWrapperStyle = undefined;
      currentWrapperClass = undefined;
      currentListStart = undefined;
    }
  };

  for (const block of blocks) {
    if (block.html.startsWith('<li')) {
      const nextListType = block.listType ?? 'ul';
      if (listBuffer.length > 0 && nextListType !== currentListType) {
        flush();
      }
      if (listBuffer.length === 0) {
        currentListType = nextListType;
        currentWrapperStyle = block.listWrapperStyle;
        currentWrapperClass = block.listWrapperClass;
        currentListStart = block.listStart;
      }
      listBuffer.push(block.html);
    } else {
      flush();
      groups.push(block.html);
    }
  }

  flush();
  return groups.join('');
}

/** Below this ratio of changed characters, two blocks are treated as the same paragraph. */
const LOCALIZED_BLOCK_CHANGE_RATIO = 0.18;

type BlockAlignmentOp =
  | { kind: 'equal'; oldBlock: HtmlBlock; newBlock: HtmlBlock }
  | { kind: 'modify'; oldBlock: HtmlBlock; newBlock: HtmlBlock }
  | { kind: 'delete'; oldBlock: HtmlBlock }
  | { kind: 'insert'; newBlock: HtmlBlock };

function isIgnorableBlock(block: HtmlBlock): boolean {
  return block.isSpacer || !block.text.replace(/\u00a0/g, ' ').trim();
}

function shouldPairBlocks(oldBlock: HtmlBlock, newBlock: HtmlBlock): boolean {
  const oldText = oldBlock.text;
  const newText = newBlock.text;
  if (oldText === newText) {
    return true;
  }
  if (newText.startsWith(oldText) || oldText.startsWith(newText)) {
    return true;
  }
  return changedCharRatio(oldText, newText) <= LOCALIZED_BLOCK_CHANGE_RATIO;
}

/** Pair removed/added blocks so spacer drift does not force whole-paragraph deletes. */
function reconcileRemovedAdded(
  removed: HtmlBlock[],
  added: HtmlBlock[],
): BlockAlignmentOp[] {
  const ops: BlockAlignmentOp[] = [];
  let removedIdx = 0;
  let addedIdx = 0;

  while (removedIdx < removed.length || addedIdx < added.length) {
    const oldBlock = removed[removedIdx];
    const newBlock = added[addedIdx];

    if (oldBlock && isIgnorableBlock(oldBlock)) {
      ops.push({ kind: 'delete', oldBlock });
      removedIdx++;
      continue;
    }

    if (newBlock && isIgnorableBlock(newBlock)) {
      ops.push({ kind: 'insert', newBlock });
      addedIdx++;
      continue;
    }

    if (oldBlock && newBlock && shouldPairBlocks(oldBlock, newBlock)) {
      ops.push(
        oldBlock.text === newBlock.text
          ? { kind: 'equal', oldBlock, newBlock }
          : { kind: 'modify', oldBlock, newBlock },
      );
      removedIdx++;
      addedIdx++;
      continue;
    }

    if (oldBlock) {
      ops.push({ kind: 'delete', oldBlock });
      removedIdx++;
      continue;
    }

    if (newBlock) {
      ops.push({ kind: 'insert', newBlock });
      addedIdx++;
    }
  }

  return ops;
}

function buildBlockAlignmentOps(oldBlocks: HtmlBlock[], newBlocks: HtmlBlock[]): BlockAlignmentOp[] {
  const blockDiff = diffArrays(
    oldBlocks.map((block) => block.text),
    newBlocks.map((block) => block.text),
  );

  const ops: BlockAlignmentOp[] = [];
  let oldIdx = 0;
  let newIdx = 0;
  let pendingRemoved: HtmlBlock[] = [];
  let pendingAdded: HtmlBlock[] = [];

  const flushPending = () => {
    if (pendingRemoved.length === 0 && pendingAdded.length === 0) {
      return;
    }
    ops.push(...reconcileRemovedAdded(pendingRemoved, pendingAdded));
    pendingRemoved = [];
    pendingAdded = [];
  };

  for (const chunk of blockDiff) {
    const count = chunk.value.length;

    if (chunk.removed) {
      for (let i = 0; i < count; i++) {
        pendingRemoved.push(oldBlocks[oldIdx++]);
      }
      continue;
    }

    if (chunk.added) {
      for (let i = 0; i < count; i++) {
        pendingAdded.push(newBlocks[newIdx++]);
      }
      continue;
    }

    flushPending();
    for (let i = 0; i < count; i++) {
      const oldBlock = oldBlocks[oldIdx++];
      const newBlock = newBlocks[newIdx++];
      if (oldBlock.text === newBlock.text) {
        ops.push({ kind: 'equal', oldBlock, newBlock });
      } else {
        ops.push({ kind: 'modify', oldBlock, newBlock });
      }
    }
  }

  flushPending();
  return ops;
}

function appendBlockOpParts(parts: DiffPart[], op: BlockAlignmentOp): void {
  switch (op.kind) {
    case 'equal':
      parts.push({ op: 'equal', value: `${op.newBlock.text}\n` });
      break;
    case 'modify':
      parts.push(...computeDiff(op.oldBlock.text, op.newBlock.text));
      break;
    case 'delete':
      if (op.oldBlock.text) {
        parts.push({ op: 'delete', value: `${op.oldBlock.text}\n` });
      }
      break;
    case 'insert':
      if (op.newBlock.text) {
        parts.push({ op: 'insert', value: `${op.newBlock.text}\n` });
      }
      break;
  }
}

function appendBlockOpHtml(
  op: BlockAlignmentOp,
  redlineBlocks: GroupedBlockHtml[],
  cleanBlocks: GroupedBlockHtml[],
  formatting?: FormattingContext,
): void {
  switch (op.kind) {
    case 'equal': {
      const grouped = toGroupedBlock(op.newBlock, op.oldBlock);
      redlineBlocks.push(grouped);
      cleanBlocks.push(grouped);
      break;
    }
    case 'modify': {
      const listType = resolveListType(op.newBlock, op.oldBlock.listType);
      redlineBlocks.push({
        html: renderModifiedBlock(op.oldBlock, op.newBlock, true, formatting),
        listType,
        listWrapperStyle: op.newBlock.listWrapperStyle ?? op.oldBlock.listWrapperStyle,
        listWrapperClass: op.newBlock.listWrapperClass ?? op.oldBlock.listWrapperClass,
        listStart: op.newBlock.listStart ?? op.oldBlock.listStart,
      });
      cleanBlocks.push({
        html: renderModifiedBlock(op.oldBlock, op.newBlock, false, formatting),
        listType,
        listWrapperStyle: op.newBlock.listWrapperStyle ?? op.oldBlock.listWrapperStyle,
        listWrapperClass: op.newBlock.listWrapperClass ?? op.oldBlock.listWrapperClass,
        listStart: op.newBlock.listStart ?? op.oldBlock.listStart,
      });
      break;
    }
    case 'delete': {
      const block = op.oldBlock;
      redlineBlocks.push(toGroupedBlock({
        ...block,
        html: wrapBlock(
          block.tag,
          `<span style="${REDLINE_STYLES.delete}">${block.innerHtml}</span>`,
          block.blockStyle,
          block.blockClass,
        ),
      }));
      break;
    }
    case 'insert': {
      const block = op.newBlock;
      if (isIgnorableBlock(block)) {
        // Empty/structural block (e.g. paragraph created by Enter) — include as-is
        // without redline decoration so caret restoration works and no blue &nbsp; appears.
        const emptyHtml = wrapBlock(block.tag, '', block.blockStyle, block.blockClass);
        const grouped: GroupedBlockHtml = {
          html: emptyHtml,
          listType: block.listType,
          listWrapperStyle: block.listWrapperStyle,
          listWrapperClass: block.listWrapperClass,
          listStart: block.listStart,
        };
        redlineBlocks.push(grouped);
        cleanBlocks.push(grouped);
      } else {
        redlineBlocks.push(toGroupedBlock({
          ...block,
          html: wrapBlock(
            block.tag,
            `<span style="${REDLINE_STYLES.insert}">${block.innerHtml}</span>`,
            block.blockStyle,
            block.blockClass,
          ),
        }));
        cleanBlocks.push(toGroupedBlock(block));
      }
      break;
    }
  }
}

function renderBlockAlignmentOps(
  ops: BlockAlignmentOp[],
  formatting?: FormattingContext,
): BlockPreservingResult {
  const redlineBlocks: GroupedBlockHtml[] = [];
  const cleanBlocks: GroupedBlockHtml[] = [];
  const parts: DiffPart[] = [];

  for (const op of ops) {
    appendBlockOpParts(parts, op);
    appendBlockOpHtml(op, redlineBlocks, cleanBlocks, formatting);
  }

  return {
    parts,
    html: groupListBlocks(redlineBlocks),
    cleanHtml: groupListBlocks(cleanBlocks),
  };
}

function blocksNeedVariableAlignment(oldBlocks: HtmlBlock[], newBlocks: HtmlBlock[]): boolean {
  if (oldBlocks.length !== newBlocks.length) {
    return true;
  }

  for (let i = 0; i < oldBlocks.length; i++) {
    const oldBlock = oldBlocks[i];
    const newBlock = newBlocks[i];
    if (oldBlock.text === newBlock.text) {
      continue;
    }
    if (isIgnorableBlock(oldBlock) || isIgnorableBlock(newBlock)) {
      if (!shouldPairBlocks(oldBlock, newBlock)) {
        return true;
      }
    }
  }

  return false;
}

function renderPairedBlocks(
  oldBlocks: HtmlBlock[],
  newBlocks: HtmlBlock[],
  formatting?: FormattingContext,
): BlockPreservingResult {
  const redlineBlocks: GroupedBlockHtml[] = [];
  const cleanBlocks: GroupedBlockHtml[] = [];
  const parts: DiffPart[] = [];

  for (let i = 0; i < oldBlocks.length; i++) {
    const oldBlock = oldBlocks[i];
    const newBlock = newBlocks[i];
    const listType = resolveListType(newBlock, oldBlock.listType);

    if (oldBlock.text === newBlock.text) {
      const grouped = toGroupedBlock(newBlock, oldBlock);
      redlineBlocks.push(grouped);
      cleanBlocks.push(grouped);
      parts.push({ op: 'equal', value: `${newBlock.text}\n` });
    } else {
      const blockParts = computeDiff(oldBlock.text, newBlock.text);
      parts.push(...blockParts);
      const modified = renderModifiedBlock(oldBlock, newBlock, true, formatting);
      const cleanModified = renderModifiedBlock(oldBlock, newBlock, false, formatting);
      redlineBlocks.push({
        html: modified,
        listType,
        listWrapperStyle: newBlock.listWrapperStyle ?? oldBlock.listWrapperStyle,
        listWrapperClass: newBlock.listWrapperClass ?? oldBlock.listWrapperClass,
        listStart: newBlock.listStart ?? oldBlock.listStart,
      });
      cleanBlocks.push({
        html: cleanModified,
        listType,
        listWrapperStyle: newBlock.listWrapperStyle ?? oldBlock.listWrapperStyle,
        listWrapperClass: newBlock.listWrapperClass ?? oldBlock.listWrapperClass,
        listStart: newBlock.listStart ?? oldBlock.listStart,
      });
    }
  }

  return {
    parts,
    html: groupListBlocks(redlineBlocks),
    cleanHtml: groupListBlocks(cleanBlocks),
  };
}

function mergeSplitBlocks(oldBlocks: HtmlBlock[], newBlocks: HtmlBlock[]): HtmlBlock[] | null {
  if (oldBlocks.length !== 1 || newBlocks.length <= 1) {
    return null;
  }

  const oldText = oldBlocks[0].text;
  const mergedText = newBlocks.map((block) => block.text).join('');
  const parts = computeDiff(oldText, mergedText);
  const deletedChars = parts
    .filter((part) => part.op === 'delete')
    .reduce((sum, part) => sum + part.value.length, 0);

  if (deletedChars >= oldText.length * 0.45) {
    return null;
  }

  const tag = newBlocks[0]?.tag || oldBlocks[0].tag;
  const blockStyle = newBlocks[0]?.blockStyle ?? oldBlocks[0]?.blockStyle;
  const blockClass = newBlocks[0]?.blockClass ?? oldBlocks[0]?.blockClass;
  const innerHtml = newBlocks.map((block) => block.innerHtml).join('');

  return [
    {
      text: mergedText,
      tag,
      blockStyle,
      blockClass,
      listType: newBlocks[0]?.listType ?? oldBlocks[0]?.listType,
      innerHtml,
      html: wrapBlock(tag, innerHtml, blockStyle, blockClass),
    },
  ];
}

function renderVariableBlocks(
  oldBlocks: HtmlBlock[],
  newBlocks: HtmlBlock[],
  formatting?: FormattingContext,
): BlockPreservingResult {
  return renderBlockAlignmentOps(buildBlockAlignmentOps(oldBlocks, newBlocks), formatting);
}

export interface BlockPreservingResult {
  parts: DiffPart[];
  html: string;
  cleanHtml: string;
}

/**
 * Block-aligned HTML redline: list items and paragraphs stay intact;
 * redline spans sit inside blocks, never wrapping <li> tags.
 */
export function buildBlockPreservingRedline(
  baselineHtml: string,
  currentHtml: string,
  formatting?: FormattingContext,
): BlockPreservingResult | null {
  const oldBlocks = extractHtmlBlocks(baselineHtml);
  let newBlocks = extractHtmlBlocks(currentHtml);

  if (oldBlocks.length === 0 && newBlocks.length === 0) {
    return null;
  }

  if (oldBlocks.length === 1 && newBlocks.length > 1) {
    const merged = mergeSplitBlocks(oldBlocks, newBlocks);
    if (merged) {
      newBlocks = merged;
    }
  }

  if (oldBlocks.length === newBlocks.length && oldBlocks.length > 0) {
    newBlocks = newBlocks.map((block, index) => ({
      ...block,
      listType: block.listType ?? oldBlocks[index]?.listType,
      listWrapperStyle: block.listWrapperStyle ?? oldBlocks[index]?.listWrapperStyle,
      listWrapperClass: block.listWrapperClass ?? oldBlocks[index]?.listWrapperClass,
      listStart: block.listStart ?? oldBlocks[index]?.listStart,
    }));

    if (blocksNeedVariableAlignment(oldBlocks, newBlocks)) {
      return renderVariableBlocks(oldBlocks, newBlocks, formatting);
    }

    return renderPairedBlocks(oldBlocks, newBlocks, formatting);
  }

  return renderVariableBlocks(oldBlocks, newBlocks, formatting);
}
