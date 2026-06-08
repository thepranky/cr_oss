const BLOCKISH_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'OL',
  'UL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TABLE',
]);

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function serializeOpenTag(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const attrs: string[] = [];

  const style = element.getAttribute('style');
  if (style) {
    attrs.push(`style="${escapeAttr(style)}"`);
  }

  const className = element.getAttribute('class');
  if (className) {
    attrs.push(`class="${escapeAttr(className)}"`);
  }

  const dir = element.getAttribute('dir');
  if (dir) {
    attrs.push(`dir="${escapeAttr(dir)}"`);
  }

  const lang = element.getAttribute('lang');
  if (lang) {
    attrs.push(`lang="${escapeAttr(lang)}"`);
  }

  const attrString = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  return `<${tag}${attrString}>`;
}

function hasBlockDescendant(element: Element): boolean {
  for (const child of element.children) {
    if (BLOCKISH_TAGS.has(child.tagName)) {
      return true;
    }
    if (hasBlockDescendant(child)) {
      return true;
    }
  }
  return false;
}

function isMeaningfulWrapper(element: Element): boolean {
  const tag = element.tagName;
  if (tag === 'BODY' || tag === 'HTML') {
    return false;
  }

  const hasAttrs =
    element.hasAttribute('style') ||
    element.hasAttribute('class') ||
    element.hasAttribute('dir') ||
    element.hasAttribute('lang');

  if (!hasAttrs) {
    return false;
  }

  return hasBlockDescendant(element) || element.children.length > 1;
}

export interface BodyWrapper {
  open: string;
  close: string;
}

/** Extract Outlook compose outer wrapper tags (font defaults, dir, Mso classes). */
export function extractBodyWrapper(html: string): BodyWrapper | null {
  if (!html.trim() || typeof DOMParser === 'undefined') {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const wrappers: Element[] = [];
  let node: Element | null = doc.body;

  while (node && node.children.length === 1) {
    const child = node.children[0] as Element;
    if (!isMeaningfulWrapper(child)) {
      break;
    }
    wrappers.push(child);
    node = child;
  }

  if (wrappers.length === 0) {
    return null;
  }

  const open = wrappers.map(serializeOpenTag).join('');
  const close = wrappers
    .map((wrapper) => `</${wrapper.tagName.toLowerCase()}>`)
    .reverse()
    .join('');

  return { open, close };
}

/** Re-wrap generated inner HTML in the compose body's original outer shell. */
export function finalizeBodyHtml(sourceHtml: string, innerHtml: string): string {
  const trimmed = innerHtml.trim();
  if (!trimmed) {
    return trimmed;
  }

  const wrapper = extractBodyWrapper(sourceHtml);
  if (!wrapper) {
    return trimmed.startsWith('<div') ? trimmed : `<div>${trimmed}</div>`;
  }

  const unwrapped = trimmed.replace(/^<div>([\s\S]*)<\/div>$/i, '$1').trim();
  return `${wrapper.open}${unwrapped}${wrapper.close}`;
}
