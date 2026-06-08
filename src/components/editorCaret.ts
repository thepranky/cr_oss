import { REDLINE_STYLES } from '../redline/types';

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
): void {
  let offset = 0;
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
    if (callback(node, start, end)) {
      return;
    }
    offset = end;
    node = walker.nextNode() as Text | null;
  }
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

  let lastNode: Text | null = null;
  let lastEnd = 0;

  walkCleanTextNodes(root, (node, start, end) => {
    lastNode = node;
    lastEnd = end;
    if (offset >= start && offset < end) {
      targetNode = node;
      targetOffset = offset - start;
      return true;
    }
    return false;
  });

  const tail: Text | null = lastNode;
  if (!targetNode && tail !== null && offset === lastEnd) {
    targetOffset = tail.textContent?.length ?? 0;
    targetNode = tail;
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

