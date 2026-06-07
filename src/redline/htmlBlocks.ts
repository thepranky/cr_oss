import { diffArrays } from 'diff';
import { computeDiff } from './diff';
import {
  buildInlinePlainTextMap,
  resolveInsertHtml,
  sliceMapRange,
  sliceWithFormattingPreference,
} from './htmlPlainMap';
import { escapeHtml, formatTextForHtml } from './render';
import { REDLINE_STYLES, type DiffPart } from './types';

export interface HtmlBlock {
  text: string;
  html: string;
  tag: string;
  innerHtml: string;
}

/** Outlook-friendly list wrapper styles. */
export const EMAIL_UL_STYLE =
  'margin-top:0;margin-bottom:0;padding-left:24px;list-style-type:disc;';

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

const INLINE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'A', 'FONT']);

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
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

function pushBlock(element: Element, blocks: HtmlBlock[]) {
  const tag = element.tagName.toLowerCase();
  const text = element.textContent ?? '';
  if (!text.trim() && tag !== 'li') {
    return;
  }

  const innerHtml = serializeElementInner(element);
  blocks.push({
    text,
    tag,
    innerHtml,
    html: `<${tag}>${innerHtml}</${tag}>`,
  });
}

function extractBlocksFromNode(node: Node, blocks: HtmlBlock[]): void {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  const tag = element.tagName;

  if (tag === 'UL' || tag === 'OL') {
    for (const child of element.children) {
      if (child.tagName === 'LI') {
        pushBlock(child, blocks);
      }
    }
    return;
  }

  if (BLOCK_TAGS.has(tag)) {
    pushBlock(element, blocks);
    return;
  }

  for (const child of element.childNodes) {
    extractBlocksFromNode(child, blocks);
  }
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
    blocks.push({
      text: bodyText,
      tag: 'p',
      innerHtml,
      html: `<p>${innerHtml}</p>`,
    });
  }

  return blocks;
}

function wrapBlock(tag: string, inner: string): string {
  return `<${tag}>${inner}</${tag}>`;
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
        );
        oldCursor += length;
        newCursor += length;
        break;
      }
      case 'delete': {
        const deleted =
          sliceMapRange(baselineMap, oldCursor, oldCursor + length) ||
          formatTextForHtml(part.value);
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
): string {
  const parts = computeDiff(oldBlock.text, newBlock.text);
  const tag = newBlock.tag || oldBlock.tag || 'p';
  const inner = renderStyledInlineDiff(parts, oldBlock, newBlock, markChanges);
  return wrapBlock(tag, inner);
}

/** Group consecutive list items into a single ul for email clients. */
export function groupListBlocks(blockHtmls: string[]): string {
  const groups: string[] = [];
  let listBuffer: string[] = [];

  const flush = () => {
    if (listBuffer.length > 0) {
      groups.push(`<ul style="${EMAIL_UL_STYLE}">${listBuffer.join('')}</ul>`);
      listBuffer = [];
    }
  };

  for (const html of blockHtmls) {
    if (html.startsWith('<li')) {
      listBuffer.push(html);
    } else {
      flush();
      groups.push(html);
    }
  }

  flush();
  return groups.join('');
}

function flattenBlockDiffParts(
  blockDiff: ReturnType<typeof diffArrays<string>>,
  oldBlocks: HtmlBlock[],
  newBlocks: HtmlBlock[],
): DiffPart[] {
  const parts: DiffPart[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  for (const chunk of blockDiff) {
    const count = chunk.value.length;

    if (chunk.removed) {
      for (let i = 0; i < count; i++) {
        const text = oldBlocks[oldIdx]?.text ?? '';
        if (text) {
          parts.push({ op: 'delete', value: `${text}\n` });
        }
        oldIdx++;
      }
      continue;
    }

    if (chunk.added) {
      for (let i = 0; i < count; i++) {
        const text = newBlocks[newIdx]?.text ?? '';
        if (text) {
          parts.push({ op: 'insert', value: `${text}\n` });
        }
        newIdx++;
      }
      continue;
    }

    for (let i = 0; i < count; i++) {
      const oldBlock = oldBlocks[oldIdx];
      const newBlock = newBlocks[newIdx];
      if (oldBlock && newBlock && oldBlock.text !== newBlock.text) {
        parts.push(...computeDiff(oldBlock.text, newBlock.text));
      } else {
        const text = newBlock?.text ?? oldBlock?.text ?? '';
        if (text) {
          parts.push({ op: 'equal', value: `${text}\n` });
        }
      }
      oldIdx++;
      newIdx++;
    }
  }

  return parts;
}

function renderPairedBlocks(
  oldBlocks: HtmlBlock[],
  newBlocks: HtmlBlock[],
): BlockPreservingResult {
  const redlineBlocks: string[] = [];
  const cleanBlocks: string[] = [];
  const parts: DiffPart[] = [];

  for (let i = 0; i < oldBlocks.length; i++) {
    const oldBlock = oldBlocks[i];
    const newBlock = newBlocks[i];

    if (oldBlock.text === newBlock.text) {
      redlineBlocks.push(newBlock.html);
      cleanBlocks.push(newBlock.html);
      parts.push({ op: 'equal', value: `${newBlock.text}\n` });
    } else {
      const blockParts = computeDiff(oldBlock.text, newBlock.text);
      parts.push(...blockParts);
      redlineBlocks.push(renderModifiedBlock(oldBlock, newBlock, true));
      cleanBlocks.push(renderModifiedBlock(oldBlock, newBlock, false));
    }
  }

  return {
    parts,
    html: `<div>${groupListBlocks(redlineBlocks)}</div>`,
    cleanHtml: `<div>${groupListBlocks(cleanBlocks)}</div>`,
  };
}

function renderVariableBlocks(
  oldBlocks: HtmlBlock[],
  newBlocks: HtmlBlock[],
): BlockPreservingResult {
  const blockDiff = diffArrays(
    oldBlocks.map((block) => block.text),
    newBlocks.map((block) => block.text),
  );

  const redlineBlocks: string[] = [];
  const cleanBlocks: string[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  for (const chunk of blockDiff) {
    const count = chunk.value.length;

    if (chunk.removed) {
      for (let i = 0; i < count; i++) {
        const block = oldBlocks[oldIdx++];
        redlineBlocks.push(
          wrapBlock(
            block.tag,
            `<span style="${REDLINE_STYLES.delete}">${block.innerHtml}</span>`,
          ),
        );
      }
      continue;
    }

    if (chunk.added) {
      for (let i = 0; i < count; i++) {
        const block = newBlocks[newIdx++];
        redlineBlocks.push(
          wrapBlock(
            block.tag,
            `<span style="${REDLINE_STYLES.insert}">${block.innerHtml}</span>`,
          ),
        );
        cleanBlocks.push(block.html);
      }
      continue;
    }

    for (let i = 0; i < count; i++) {
      const oldBlock = oldBlocks[oldIdx++];
      const newBlock = newBlocks[newIdx++];

      if (oldBlock.text === newBlock.text) {
        redlineBlocks.push(newBlock.html);
        cleanBlocks.push(newBlock.html);
      } else {
        redlineBlocks.push(renderModifiedBlock(oldBlock, newBlock, true));
        cleanBlocks.push(renderModifiedBlock(oldBlock, newBlock, false));
      }
    }
  }

  return {
    parts: flattenBlockDiffParts(blockDiff, oldBlocks, newBlocks),
    html: `<div>${groupListBlocks(redlineBlocks)}</div>`,
    cleanHtml: `<div>${groupListBlocks(cleanBlocks)}</div>`,
  };
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
): BlockPreservingResult | null {
  const oldBlocks = extractHtmlBlocks(baselineHtml);
  const newBlocks = extractHtmlBlocks(currentHtml);

  if (oldBlocks.length === 0 && newBlocks.length === 0) {
    return null;
  }

  if (oldBlocks.length === newBlocks.length && oldBlocks.length > 0) {
    return renderPairedBlocks(oldBlocks, newBlocks);
  }

  return renderVariableBlocks(oldBlocks, newBlocks);
}
