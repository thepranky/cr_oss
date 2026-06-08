const ALLOWED_TAGS = new Set(['b', 'i', 'p', 'ul', 'ol', 'li', 'br']);

function normalizeTagName(rawTag: string): string | null {
  const base = rawTag.replace(/^[a-z0-9]+:/i, '').toLowerCase();
  if (base === 'strong') return 'b';
  if (base === 'em') return 'i';
  if (ALLOWED_TAGS.has(base)) return base;
  return null;
}

/** Remove Word-specific noise before tag whitelisting. */
export function preprocessWordHtml(html: string): string {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/<!--\[if[\s\S]*?endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?o:p[^>]*>/gi, '')
    .replace(/<\/?(?:v:|w:|m:|o:)[^>]+>/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '')
    .replace(/\sstyle='[^']*'/gi, '')
    .replace(/\sclass="[^"]*"/gi, '')
    .replace(/\sclass='[^']*'/gi, '');
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;
  const tag = normalizeTagName(element.tagName);

  if (!tag) {
    return Array.from(element.childNodes).map(serializeNode).join('');
  }

  if (tag === 'br') {
    return '<br>';
  }

  const inner = Array.from(element.childNodes).map(serializeNode).join('');
  return `<${tag}>${inner}</${tag}>`;
}

function sanitizeWithDom(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes).map(serializeNode).join('').trim();
}

/** Regex fallback when DOMParser is unavailable (e.g. unit tests in Node). */
function sanitizeWithRegex(html: string): string {
  let cleaned = html.replace(/<([a-z0-9:]+)(\s[^>]*)?\/?>/gi, (match, rawTag: string) => {
    const tag = normalizeTagName(rawTag);
    if (!tag) return '';
    if (tag === 'br') return '<br>';
    if (match.endsWith('/>')) return `<${tag}></${tag}>`;
    return `<${tag}>`;
  });

  cleaned = cleaned.replace(/<\/([a-z0-9:]+)>/gi, (_match, rawTag: string) => {
    const tag = normalizeTagName(rawTag);
    return tag ? `</${tag}>` : '';
  });

  return cleaned.trim();
}

/**
 * Sanitize HTML pasted from Word: drop mso/o:p/conditional comments,
 * keep semantic tags (b, i, p, ul, li).
 */
export function sanitizeWordHtml(html: string): string {
  if (!html.trim()) {
    return '';
  }

  const preprocessed = preprocessWordHtml(html);
  if (typeof DOMParser !== 'undefined') {
    return sanitizeWithDom(preprocessed);
  }
  return sanitizeWithRegex(preprocessed);
}

/** Plain text from clipboard when HTML is unavailable or empty after sanitization. */
function pasteFromHtmlOrPlain(clipboard: DataTransfer): string {
  const html = clipboard.getData('text/html');
  if (html.trim()) {
    const sanitized = sanitizeWordHtml(html);
    if (sanitized) {
      return sanitized;
    }
  }

  const plain = clipboard.getData('text/plain');
  return plain
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `<p>${escapePlainLine(line)}</p>`)
    .join('');
}

/** Paste handler: OOXML track changes when present, otherwise sanitized HTML/plain text. */
export async function pasteContentFromClipboard(clipboard: DataTransfer): Promise<string> {
  const { tryPasteFromWordOoxml } = await import('./wordOoxml');
  const ooxmlHtml = await tryPasteFromWordOoxml(clipboard);
  if (ooxmlHtml) {
    return ooxmlHtml;
  }
  return pasteFromHtmlOrPlain(clipboard);
}

function escapePlainLine(line: string): string {
  return line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
