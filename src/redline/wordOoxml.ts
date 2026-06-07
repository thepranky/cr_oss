import { unzipSync } from 'fflate';
import { escapeHtml } from './render';
import { REDLINE_STYLES } from './types';

const DOCX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-zip-compressed',
  'application/zip',
];

const WORD_XMLNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function localName(node: Element): string {
  return node.localName ?? node.tagName.replace(/^[^:]+:/, '');
}

function readDocumentXml(bytes: Uint8Array): string | null {
  try {
    const files = unzipSync(bytes);
    const docBytes = files['word/document.xml'];
    if (!docBytes) {
      return null;
    }
    return new TextDecoder().decode(docBytes);
  } catch {
    return null;
  }
}

function hasRevisionMarkup(documentXml: string): boolean {
  return /(<(?:w:)?ins[\s>])|(<(?:w:)?del[\s>])/i.test(documentXml);
}

function walkOoxmlNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;
  const name = localName(element);

  if (name === 't') {
    return escapeHtml(element.textContent ?? '');
  }

  if (name === 'delText') {
    const text = escapeHtml(element.textContent ?? '');
    return `<span style="${REDLINE_STYLES.delete}">${text}</span>`;
  }

  if (name === 'tab') {
    return ' ';
  }

  if (name === 'br' || name === 'cr') {
    return '<br>';
  }

  if (name === 'ins') {
    return `<span style="${REDLINE_STYLES.insert}">${walkOoxmlChildren(element)}</span>`;
  }

  if (name === 'del') {
    return `<span style="${REDLINE_STYLES.delete}">${walkOoxmlChildren(element)}</span>`;
  }

  if (name === 'p') {
    const inner = walkOoxmlChildren(element);
    return inner ? `<p>${inner}</p>` : '';
  }

  if (name === 'body') {
    return walkOoxmlChildren(element);
  }

  return walkOoxmlChildren(element);
}

function walkOoxmlChildren(element: Element): string {
  return Array.from(element.childNodes)
    .map((child) => walkOoxmlNode(child))
    .join('');
}

/** Parse Word document.xml revision markup into email-safe redline HTML. */
export function ooxmlDocumentToHtml(documentXml: string): string | null {
  if (!documentXml.trim() || typeof DOMParser === 'undefined') {
    return null;
  }

  if (!hasRevisionMarkup(documentXml)) {
    return null;
  }

  try {
    const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return null;
    }

    const body =
      doc.getElementsByTagNameNS(WORD_XMLNS, 'body')[0] ??
      Array.from(doc.getElementsByTagName('*')).find((el) => localName(el) === 'body');

    if (!body) {
      return null;
    }

    const inner = walkOoxmlChildren(body);
    if (!inner.trim()) {
      return null;
    }

    return `<div>${inner}</div>`;
  } catch {
    return null;
  }
}

/** Convert a .docx byte payload from the clipboard into redline HTML when revisions exist. */
export function docxBytesToRedlineHtml(bytes: Uint8Array): string | null {
  const documentXml = readDocumentXml(bytes);
  if (!documentXml) {
    return null;
  }
  return ooxmlDocumentToHtml(documentXml);
}

/** Read docx bytes from clipboard DataTransferItem list; null if unavailable. */
export async function readDocxFromClipboard(clipboard: DataTransfer): Promise<Uint8Array | null> {
  const items = clipboard.items;
  if (!items) {
    return null;
  }

  for (const item of items) {
    const type = item.type.toLowerCase();
    const isDocx = DOCX_MIME_TYPES.some((mime) => type === mime || type.includes('wordprocessingml'));
    const isZip = type.includes('zip');

    if (!isDocx && !isZip) {
      continue;
    }

    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
        return bytes;
      }
    } catch {
      // try next clipboard item
    }
  }

  return null;
}

/** Try OOXML clipboard import; returns null to signal fallback to HTML/plain paste. */
export async function tryPasteFromWordOoxml(clipboard: DataTransfer): Promise<string | null> {
  const bytes = await readDocxFromClipboard(clipboard);
  if (!bytes) {
    return null;
  }
  return docxBytesToRedlineHtml(bytes);
}
