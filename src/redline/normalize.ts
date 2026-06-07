/** Decode common HTML entities to plain text characters. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Convert HTML (e.g. Outlook compose body) to plain text for diffing.
 * Block-level tags become newline breaks; inline tags are stripped.
 */
export function htmlToPlainText(html: string): string {
  if (!html.trim()) {
    return '';
  }

  let text = html
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  text = decodeHtmlEntities(text);
  return text.replace(/\n{3,}/g, '\n\n');
}

/** Normalize plain text: unify line endings and decode any stray entities. */
export function normalizePlainText(text: string): string {
  return decodeHtmlEntities(text.replace(/\r\n/g, '\n'));
}

/** Normalize HTML or plain text input to a comparable plain-text string. */
export function normalizeForDiff(input: string, isHtml = false): string {
  return isHtml ? htmlToPlainText(input) : normalizePlainText(input);
}
