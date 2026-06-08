import { escapeHtml } from './render';

const INLINE_STYLE_PROPS = [
  'font-family',
  'font-size',
  'color',
  'font-weight',
  'font-style',
  'text-decoration',
];

const BLOCK_STYLE_PROPS = [
  'margin-top',
  'margin-bottom',
  'margin',
  'line-height',
  'text-align',
  'padding-left',
  'mso-line-height-rule',
  'mso-margin-top-alt',
  'mso-margin-bottom-alt',
];

const INLINE_TAGS = new Set(['SPAN', 'FONT', 'B', 'STRONG', 'I', 'EM', 'U', 'A']);
const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

export interface DominantFormatting {
  inlineStyle: string;
  blockStyle: string;
}

export interface FormattingContext {
  dominant: DominantFormatting | null;
}

type StyleCounts = Map<string, Map<string, number>>;

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

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

function recordStyle(
  counts: StyleCounts,
  style: string | null,
  allowedProps: string[],
): void {
  if (!style?.trim()) {
    return;
  }

  const declarations = parseStyleDeclarations(style);
  for (const prop of allowedProps) {
    const value = declarations.get(prop);
    if (!value) {
      continue;
    }
    if (!counts.has(prop)) {
      counts.set(prop, new Map());
    }
    const propCounts = counts.get(prop)!;
    propCounts.set(value, (propCounts.get(value) ?? 0) + 1);
  }
}

function recordFontAttributes(element: Element, counts: StyleCounts): void {
  const face = element.getAttribute('face');
  if (face) {
    if (!counts.has('font-family')) {
      counts.set('font-family', new Map());
    }
    const propCounts = counts.get('font-family')!;
    propCounts.set(face, (propCounts.get(face) ?? 0) + 1);
  }
}

function dominantValue(propCounts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [value, count] of propCounts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function buildStyleFromCounts(counts: StyleCounts, allowedProps: string[]): string {
  const parts: string[] = [];
  for (const prop of allowedProps) {
    const propCounts = counts.get(prop);
    if (!propCounts) {
      continue;
    }
    const value = dominantValue(propCounts);
    if (value) {
      parts.push(`${prop}:${value}`);
    }
  }
  return parts.join(';');
}

function walkForStyles(node: Node, inlineCounts: StyleCounts, blockCounts: StyleCounts): void {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  const tag = element.tagName;

  if (INLINE_TAGS.has(tag)) {
    recordStyle(inlineCounts, element.getAttribute('style'), INLINE_STYLE_PROPS);
    if (tag === 'FONT') {
      recordFontAttributes(element, inlineCounts);
    }
  }

  if (BLOCK_TAGS.has(tag)) {
    recordStyle(blockCounts, element.getAttribute('style'), BLOCK_STYLE_PROPS);
  }

  for (const child of element.childNodes) {
    walkForStyles(child, inlineCounts, blockCounts);
  }
}

/** Detect the most common inline and block styles in an HTML fragment. */
export function extractDominantFormatting(html: string): DominantFormatting | null {
  if (!html.trim() || typeof DOMParser === 'undefined') {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const inlineCounts: StyleCounts = new Map();
  const blockCounts: StyleCounts = new Map();

  for (const child of doc.body.childNodes) {
    walkForStyles(child, inlineCounts, blockCounts);
  }

  const inlineStyle = buildStyleFromCounts(inlineCounts, INLINE_STYLE_PROPS);
  const blockStyle = buildStyleFromCounts(blockCounts, BLOCK_STYLE_PROPS);

  if (!inlineStyle && !blockStyle) {
    return null;
  }

  return { inlineStyle, blockStyle };
}

/** Wrap plain diff text with the dominant inline style when no other formatting applies. */
export function wrapWithDominantInline(
  plain: string,
  dominant: DominantFormatting | null | undefined,
): string {
  const formatted = escapeHtml(plain).replace(/\n/g, '<br>');
  if (!dominant?.inlineStyle) {
    return formatted;
  }
  return `<span style="${escapeAttr(dominant.inlineStyle)}">${formatted}</span>`;
}

/** Wrap HTML content in a paragraph using the dominant block style. */
export function wrapWithDominantBlock(
  inner: string,
  dominant: DominantFormatting | null | undefined,
  tag = 'p',
): string {
  if (!dominant?.blockStyle) {
    return `<${tag}>${inner}</${tag}>`;
  }
  return `<${tag} style="${escapeAttr(dominant.blockStyle)}">${inner}</${tag}>`;
}
