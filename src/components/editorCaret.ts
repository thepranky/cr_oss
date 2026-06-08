import { REDLINE_STYLES } from '../redline/types';

const BLOCK_SELECTOR = 'p, div, li, h1, h2, h3, h4, h5, h6';

/**
 * Return the last block-level child of root if it has no visible text and no
 * redline decorations — this is an empty paragraph/list-item created by Enter.
 */
function findLastEmptyBlock(root: HTMLElement): Element | null {
  const blocks = root.querySelectorAll(BLOCK_SELECTOR);
  if (blocks.length === 0) {
    return null;
  }
  const last = blocks[blocks.length - 1];
  if ((last.textContent ?? '').trim()) {
    return null;
  }
  if (last.querySelector('[data-redline]')) {
    return null;
  }
  return last;
}

function isRedlineDeleteElement(element: Element): boolean {
  if (element.getAttribute('data-redline') === 'delete') {
    return true;
  }

  if (element.tagName !== 'SPAN') {
    return false;
  }

  const style = (element.getAttribute('style') ?? '').replace(/\s/g, '');
  return style === REDLINE_STYLES.delete.replace(/\s/g, '');
}

function isInsideRedlineDelete(node: Node, root: HTMLElement): boolean {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE && isRedlineDeleteElement(current as Element)) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

function walkCleanTextNodes(
  root: HTMLElement,
  callback: (node: Text, start: number, end: number) => boolean,
): { lastText: Text | null; lastEnd: number } {
  let offset = 0;
  let lastText: Text | null = null;
  let lastEnd = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (isInsideRedlineDelete(node, root)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.textContent?.length ?? 0;
    const start = offset;
    const end = offset + length;
    lastText = node;
    lastEnd = end;
    if (callback(node, start, end)) {
      break;
    }
    offset = end;
    node = walker.nextNode() as Text | null;
  }

  return { lastText, lastEnd };
}

/** Plain-text offset in the editor, excluding visible deletions. */
export function getCaretCleanOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
    return null;
  }

  const caret = selection.getRangeAt(0);
  if (!caret.collapsed) {
    return null;
  }

  const marker = caret.cloneRange();
  marker.selectNodeContents(root);
  marker.setEnd(caret.startContainer, caret.startOffset);

  let cleanOffset = 0;
  let resolved = false;

  walkCleanTextNodes(root, (node, start) => {
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);

    if (marker.compareBoundaryPoints(Range.END_TO_END, nodeRange) < 0) {
      const inner = marker.cloneRange();
      inner.setStart(node, 0);
      cleanOffset = start + inner.toString().length;
      resolved = true;
      return true;
    }

    cleanOffset = start + (node.textContent?.length ?? 0);
    return false;
  });

  return resolved ? cleanOffset : cleanOffset;
}

export function setCaretCleanOffset(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  let targetNode: Text | null = null;
  let targetOffset = 0;

  const { lastText, lastEnd } = walkCleanTextNodes(root, (node, start, end) => {
    if (offset >= start && offset < end) {
      targetNode = node;
      targetOffset = offset - start;
      return true;
    }
    return false;
  });

  if (!targetNode && lastText !== null && offset === lastEnd) {
    const emptyBlock = findLastEmptyBlock(root);
    if (emptyBlock) {
      const range = document.createRange();
      range.setStart(emptyBlock, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    targetOffset = lastText.textContent?.length ?? 0;
    targetNode = lastText;
  }

  if (!targetNode) {
    return;
  }

  const range = document.createRange();
  range.setStart(targetNode, targetOffset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

