import type { FormattingContext } from './dominantStyle';
import { wrapWithDominantInline } from './dominantStyle';
import { decodeHtmlEntities } from './normalize';
import { escapeHtml, formatTextForHtml } from './render';

export interface PlainTextMap {
  text: string;
  /** Text spans with pre-serialized HTML for each contiguous text node run. */
  segments: Array<{ start: number; end: number; html: string }>;
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const INLINE_FORMATTING_PATTERN = /<(b|strong|i|em|u|span|font|a)\b/i;

function isRedlineInlineWrapper(element: Element): boolean {
  return element.hasAttribute('data-redline-inline');
}

function hasInlineFormatting(html: string): boolean {
  return INLINE_FORMATTING_PATTERN.test(html);
}

function collapseNewlines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function inlineOpenTag(node: Element): string {
  const tag = node.tagName.toLowerCase();
  if (tag === 'font') {
    const face = node.getAttribute('face');
    const size = node.getAttribute('size');
    const color = node.getAttribute('color');
    const attrs = [
      face ? ` face="${escapeAttr(face)}"` : '',
      size ? ` size="${escapeAttr(size)}"` : '',
      color ? ` color="${escapeAttr(color)}"` : '',
    ].join('');
    return `<font${attrs}>`;
  }

  const style = node.getAttribute('style');
  const styleAttr = style ? ` style="${escapeAttr(style)}"` : '';
  if (tag === 'a') {
    const href = node.getAttribute('href');
    const hrefAttr = href ? ` href="${escapeAttr(href)}"` : '';
    return `<a${hrefAttr}${styleAttr}>`;
  }

  return `<${tag}${styleAttr}>`;
}

/** Walk inline ancestors down to the text node (block tags are handled separately). */
function serializeTextNode(textNode: Text, body: HTMLElement): string {
  const content = textNode.textContent ?? '';
  if (!content) {
    return '';
  }

  const chain: Element[] = [];
  let el: Element | null = textNode.parentElement;
  while (el && el !== body) {
    if (isRedlineInlineWrapper(el)) {
      el = el.parentElement;
      continue;
    }
    if (BLOCK_TAGS.has(el.tagName)) {
      break;
    }
    chain.unshift(el);
    el = el.parentElement;
  }

  let html = escapeHtml(content);
  for (const node of chain) {
    const open = inlineOpenTag(node);
    const tag = open.match(/^<([a-z0-9]+)/i)?.[1] ?? node.tagName.toLowerCase();
    html = `${open}${html}</${tag}>`;
  }

  return html;
}

function walkNode(
  node: Node,
  body: HTMLElement,
  text: string,
  segments: PlainTextMap['segments'],
): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent ?? '';
    if (!value) {
      return text;
    }
    const start = text.length;
    text += value;
    segments.push({
      start,
      end: text.length,
      html: serializeTextNode(node as Text, body),
    });
    return text;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return text;
  }

  const element = node as Element;
  if (element.tagName === 'BR') {
    return `${text}\n`;
  }

  for (const child of element.childNodes) {
    text = walkNode(child, body, text, segments);
  }

  if (BLOCK_TAGS.has(element.tagName) && text.length > 0 && !text.endsWith('\n')) {
    text += '\n';
  }

  return text;
}

/** Build plain text plus index map for HTML-preserving redline render. */
export function buildPlainTextMap(html: string, options?: { inlineOnly?: boolean }): PlainTextMap {
  const inlineOnly = options?.inlineOnly ?? false;
  const source = inlineOnly ? `<div data-redline-inline="">${html}</div>` : html;

  if (!source.trim()) {
    return { text: '', segments: [] };
  }

  if (typeof DOMParser === 'undefined') {
    return buildPlainTextMapFallback(html);
  }

  const doc = new DOMParser().parseFromString(source, 'text/html');
  const segments: PlainTextMap['segments'] = [];
  let text = '';

  for (const child of doc.body.childNodes) {
    text = walkNode(child, doc.body, text, segments);
  }

  return { text, segments };
}

/** Map inline HTML within a single block (no outer p/li wrapper in segments). */
export function buildInlinePlainTextMap(innerHtml: string): PlainTextMap {
  return buildPlainTextMap(innerHtml, { inlineOnly: true });
}

/** Regex fallback when DOMParser is unavailable (tests/SSR). */
function buildPlainTextMapFallback(html: string): PlainTextMap {
  let stripped = html
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  stripped = decodeHtmlEntities(stripped);
  const text = collapseNewlines(stripped);

  if (!text) {
    return { text: '', segments: [] };
  }

  return {
    text,
    segments: [{ start: 0, end: text.length, html: escapeHtml(text).replace(/\n/g, '<br>') }],
  };
}

/** Reapply opening inline tags from a segment when a diff splits mid-run. */
function wrapPartialWithSegmentHtml(segmentHtml: string, plain: string): string {
  const formatted = escapeHtml(plain).replace(/\n/g, '<br>');
  const openTags: string[] = [];
  const closeTags: string[] = [];
  const tagPattern = /<\/?([a-z0-9]+)([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(segmentHtml)) !== null) {
    const isClose = match[0].startsWith('</');
    const tag = match[1].toLowerCase();
    if (isClose) {
      closeTags.unshift(tag);
    } else if (!match[0].endsWith('/>')) {
      openTags.push(`<${tag}${match[2]}>`);
    }
  }

  if (openTags.length === 0) {
    return formatted;
  }

  return `${openTags.join('')}${formatted}${closeTags.map((tag) => `</${tag}>`).join('')}`;
}

function formatPlainFallback(
  plain: string,
  formatting?: FormattingContext,
): string {
  if (formatting?.dominant?.inlineStyle) {
    return wrapWithDominantInline(plain, formatting.dominant);
  }
  return escapeHtml(plain).replace(/\n/g, '<br>');
}

/** Extract HTML for a plain-text character range; partial overlaps fall back to escaped text. */
export function sliceMapRange(
  map: PlainTextMap,
  start: number,
  end: number,
  formatting?: FormattingContext,
): string {
  if (start >= end) {
    return '';
  }

  const parts: Array<{ start: number; end: number; html: string }> = [];

  for (const segment of map.segments) {
    if (segment.end <= start || segment.start >= end) {
      continue;
    }

    const fullSegment = segment.start >= start && segment.end <= end;
    if (fullSegment) {
      parts.push({ start: segment.start, end: segment.end, html: segment.html });
      continue;
    }

    const sliceStart = Math.max(start, segment.start);
    const sliceEnd = Math.min(end, segment.end);
    const plain = map.text.slice(sliceStart, sliceEnd);
    parts.push({
      start: sliceStart,
      end: sliceEnd,
      html: wrapPartialWithSegmentHtml(segment.html, plain),
    });
  }

  if (parts.length === 0) {
    return formatPlainFallback(map.text.slice(start, end), formatting);
  }

  parts.sort((a, b) => a.start - b.start);

  let result = '';
  let cursor = start;

  for (const part of parts) {
    if (part.start > cursor) {
      result += formatPlainFallback(map.text.slice(cursor, part.start), formatting);
    }
    result += part.html;
    cursor = part.end;
  }

  if (cursor < end) {
    result += formatPlainFallback(map.text.slice(cursor, end), formatting);
  }

  return result;
}

/** Apply inline tags from the baseline segment at `position` to plain diff text. */
function stylePlainFromBaselineAt(
  map: PlainTextMap,
  position: number,
  plain: string,
  formatting?: FormattingContext,
): string {
  for (const segment of map.segments) {
    if (position >= segment.start && position <= segment.end) {
      return wrapPartialWithSegmentHtml(segment.html, plain);
    }
  }
  return formatTextForHtml(plain, formatting?.dominant);
}

/**
 * Prefer current HTML formatting when present; otherwise keep baseline styling
 * so redlines preserve the original look when the revised text is plain.
 */
export function sliceWithFormattingPreference(
  baselineMap: PlainTextMap,
  currentMap: PlainTextMap,
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number,
  formatting?: FormattingContext,
): string {
  const fromCurrent = sliceMapRange(currentMap, newStart, newEnd, formatting);
  if (hasInlineFormatting(fromCurrent)) {
    return fromCurrent;
  }

  const fromBaseline = sliceMapRange(baselineMap, oldStart, oldEnd, formatting);
  if (hasInlineFormatting(fromBaseline)) {
    return fromBaseline;
  }

  return (
    fromCurrent ||
    fromBaseline ||
    formatTextForHtml(currentMap.text.slice(newStart, newEnd), formatting?.dominant)
  );
}

/** HTML for an inserted run, inheriting baseline styling at the insertion point when needed. */
export function resolveInsertHtml(
  baselineMap: PlainTextMap,
  currentMap: PlainTextMap,
  oldCursor: number,
  newStart: number,
  newEnd: number,
  plain: string,
  formatting?: FormattingContext,
): string {
  const fromCurrent = sliceMapRange(currentMap, newStart, newEnd, formatting);
  if (hasInlineFormatting(fromCurrent)) {
    return fromCurrent;
  }

  const inherited = stylePlainFromBaselineAt(baselineMap, oldCursor, plain, formatting);
  if (hasInlineFormatting(inherited)) {
    return inherited;
  }

  return fromCurrent || inherited || formatTextForHtml(plain, formatting?.dominant);
}

/** Wrap consecutive list items in a single ul for email-safe list output. */
export function wrapConsecutiveListItems(html: string): string {
  return html.replace(/(?:<li>[\s\S]*?<\/li>\s*)+/g, (match) => `<ul>${match.trim()}</ul>`);
}
