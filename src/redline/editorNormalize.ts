import { EMAIL_OL_STYLE, EMAIL_UL_STYLE } from './htmlBlocks';

function parseDocument(html: string): { doc: Document; root: HTMLElement } | null {
  if (!html.trim() || typeof DOMParser === 'undefined') {
    return null;
  }

  const doc = new DOMParser().parseFromString(`<div data-editor-root="">${html}</div>`, 'text/html');
  const root = doc.body.querySelector('[data-editor-root]') as HTMLElement | null;
  if (!root) {
    return null;
  }

  return { doc, root };
}

function unwrapElement(element: Element): void {
  const parent = element.parentElement;
  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

/** Unwrap single-child wrappers contenteditable often inserts inside list items. */
function unwrapListItemWrappers(root: HTMLElement): void {
  let changed = true;
  while (changed) {
    changed = false;
    root.querySelectorAll('li > div, li > p').forEach((wrapper) => {
      const parent = wrapper.parentElement;
      if (!parent || parent.tagName !== 'LI') {
        return;
      }

      const elementChildren = Array.from(parent.children);
      if (elementChildren.length !== 1 || elementChildren[0] !== wrapper) {
        return;
      }

      unwrapElement(wrapper);
      changed = true;
    });
  }
}

/** Merge consecutive list elements broken apart by browser editing. */
function mergeAdjacentLists(root: HTMLElement): void {
  let child = root.firstElementChild;
  while (child) {
    const next = child.nextElementSibling;
    if (
      next &&
      child.tagName === next.tagName &&
      (child.tagName === 'OL' || child.tagName === 'UL')
    ) {
      while (next.firstElementChild) {
        child.appendChild(next.firstElementChild);
      }
      next.remove();
      continue;
    }
    child = child.nextElementSibling;
  }
}

function ensureListStyles(root: HTMLElement): void {
  root.querySelectorAll('ol').forEach((list) => {
    if (!list.getAttribute('style')?.includes('list-style-type')) {
      list.setAttribute('style', EMAIL_OL_STYLE);
    }
  });

  root.querySelectorAll('ul').forEach((list) => {
    if (!list.getAttribute('style')?.includes('list-style-type')) {
      list.setAttribute('style', EMAIL_UL_STYLE);
    }
  });
}

function removeEmptyListItems(root: HTMLElement): void {
  root.querySelectorAll('li').forEach((item) => {
    const text = item.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
    if (!text && !item.querySelector('img, br')) {
      item.remove();
    }
  });
}

function wrapOrphanTextNodes(root: HTMLElement): void {
  const hasBlocks = root.querySelector('p, div, li, ul, ol, h1, h2, h3, h4, h5, h6');
  if (hasBlocks) {
    return;
  }

  const text = root.textContent?.trim() ?? '';
  if (!text) {
    return;
  }

  const paragraph = root.ownerDocument.createElement('p');
  paragraph.innerHTML = root.innerHTML;
  root.innerHTML = '';
  root.appendChild(paragraph);
}

/** Canonicalize contenteditable HTML so block/list redlines stay stable. */
export function normalizeEditorHtml(html: string): string {
  const parsed = parseDocument(html);
  if (!parsed) {
    return html.trim();
  }

  const { root } = parsed;
  unwrapListItemWrappers(root);
  mergeAdjacentLists(root);
  removeEmptyListItems(root);
  ensureListStyles(root);
  wrapOrphanTextNodes(root);

  return root.innerHTML.trim();
}
