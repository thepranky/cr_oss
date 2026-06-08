function getTextBeforeCursor(root: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    return null;
  }

  const preRange = range.cloneRange();
  preRange.selectNodeContents(root);
  preRange.setEnd(range.endContainer, range.endOffset);
  const text = preRange.toString();
  const lines = text.split('\n');
  return lines[lines.length - 1] ?? '';
}

function getBlockElement(node: Node | null, root: HTMLElement): HTMLElement {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tag = (current as HTMLElement).tagName;
      if (tag === 'P' || tag === 'DIV' || tag === 'LI') {
        return current as HTMLElement;
      }
    }
    current = current.parentNode;
  }
  return root;
}

function replaceBlockWithListItem(
  root: HTMLElement,
  block: HTMLElement,
  listTag: 'ul' | 'ol',
  itemHtml: string,
): void {
  const list = document.createElement(listTag);
  const item = document.createElement('li');
  if (itemHtml) {
    item.innerHTML = itemHtml;
  } else {
    item.appendChild(document.createElement('br'));
  }
  list.appendChild(item);

  const parentList = block.closest(listTag);
  if (parentList && root.contains(parentList) && block.tagName === 'LI') {
    parentList.insertBefore(item, block);
    block.remove();
  } else if (block === root) {
    block.innerHTML = '';
    block.appendChild(list);
  } else {
    block.replaceWith(list);
  }

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(item);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function removeLinePrefix(root: HTMLElement, prefixLength: number): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || prefixLength <= 0) {
    return;
  }

  const cursor = selection.getRangeAt(0);
  const before = cursor.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(cursor.endContainer, cursor.endOffset);

  const fullBefore = before.toString();
  const keep = fullBefore.slice(0, fullBefore.length - prefixLength);
  before.deleteContents();

  if (!keep) {
    return;
  }

  const textNode = document.createTextNode(keep);
  before.insertNode(textNode);
  before.setStartAfter(textNode);
  before.collapse(true);
  selection.removeAllRanges();
  selection.addRange(before);
}

function insertListItemAfter(currentItem: HTMLLIElement): HTMLLIElement {
  const next = document.createElement('li');
  const placeholder = document.createElement('br');
  next.appendChild(placeholder);
  currentItem.insertAdjacentElement('afterend', next);

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.setStart(next, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  return next;
}

function exitListItem(item: HTMLLIElement): void {
  const list = item.parentElement;
  if (!list) {
    return;
  }

  const paragraph = document.createElement('p');
  paragraph.appendChild(document.createElement('br'));
  list.insertAdjacentElement('afterend', paragraph);

  if (list.children.length === 1 && list.firstElementChild === item && !item.textContent?.trim()) {
    list.remove();
  } else {
    item.remove();
  }

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.setStart(paragraph, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Expand `* ` and `1. ` line prefixes into real HTML lists. */
export function tryExpandListShortcut(event: KeyboardEvent, root: HTMLElement): boolean {
  if (event.key !== ' ') {
    return false;
  }

  const linePrefix = getTextBeforeCursor(root);
  if (linePrefix === null) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const block = getBlockElement(range.startContainer, root);

  const bulletMatch = linePrefix.match(/^(\s*)\*$/);
  if (bulletMatch) {
    event.preventDefault();
    removeLinePrefix(root, linePrefix.length);
    replaceBlockWithListItem(root, block, 'ul', '');
    return true;
  }

  const numberedMatch = linePrefix.match(/^(\s*)(\d+)\.$/);
  if (numberedMatch) {
    event.preventDefault();
    removeLinePrefix(root, linePrefix.length);
    replaceBlockWithListItem(root, block, 'ol', '');
    return true;
  }

  return false;
}

/** Continue or exit list items when pressing Enter inside the editor. */
export function tryHandleListEnter(event: KeyboardEvent, root: HTMLElement): boolean {
  if (event.key !== 'Enter') {
    return false;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
    return false;
  }

  const anchor = selection.anchorNode;
  const item = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('li');
  if (!(item instanceof HTMLLIElement) || !root.contains(item)) {
    return false;
  }

  event.preventDefault();

  const itemText = item.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
  if (!itemText) {
    exitListItem(item);
    return true;
  }

  insertListItemAfter(item);
  return true;
}
