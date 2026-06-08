import { REDLINE_STYLES } from './types';

function isRedlineSpan(element: Element): boolean {
  if (element.tagName !== 'SPAN') {
    return false;
  }
  const style = (element.getAttribute('style') ?? '').replace(/\s/g, '');
  const deleteStyle = REDLINE_STYLES.delete.replace(/\s/g, '');
  const insertStyle = REDLINE_STYLES.insert.replace(/\s/g, '');
  return style === deleteStyle || style === insertStyle;
}

function unwrapNode(node: Element): void {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
}

function stripRedlineNode(node: Node): void {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  for (const child of Array.from(element.children)) {
    stripRedlineNode(child);
  }

  if (!isRedlineSpan(element)) {
    return;
  }

  const style = (element.getAttribute('style') ?? '').replace(/\s/g, '');
  const deleteStyle = REDLINE_STYLES.delete.replace(/\s/g, '');
  if (style === deleteStyle) {
    element.remove();
    return;
  }

  unwrapNode(element);
}

/** Remove redline markup; keep inserted/equal text and drop deletions. */
export function stripRedlineMarkup(html: string): string {
  if (!html.trim()) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return stripRedlineMarkupFallback(html);
  }

  const doc = new DOMParser().parseFromString(`<div data-redline-root="">${html}</div>`, 'text/html');
  const root = doc.body.querySelector('[data-redline-root]');
  if (!root) {
    return html;
  }

  stripRedlineNode(root);
  return root.innerHTML;
}

function stripRedlineMarkupFallback(html: string): string {
  const deletePattern = new RegExp(
    `<span\\s+style="${REDLINE_STYLES.delete.replace(/"/g, '&quot;')}">([\\s\\S]*?)</span>`,
    'gi',
  );
  const insertPattern = new RegExp(
    `<span\\s+style="${REDLINE_STYLES.insert.replace(/"/g, '&quot;')}">([\\s\\S]*?)</span>`,
    'gi',
  );

  return html.replace(deletePattern, '').replace(insertPattern, '$1');
}
