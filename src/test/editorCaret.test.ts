// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getCaretCleanOffset, setCaretCleanOffset } from '../components/editorCaret';
import { REDLINE_STYLES } from '../redline/types';

function setCursorInText(_root: HTMLElement, textNode: Text, offset: number): void {
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('editorCaret clean offsets', () => {
  it('ignores deleted redline text when measuring the caret', () => {
    const root = document.createElement('div');
    root.innerHTML = `<p>Hello <span data-redline="delete" contenteditable="false" style="${REDLINE_STYLES.delete}">removed</span> world</p>`;
    document.body.appendChild(root);

    const worldNode = root.querySelector('p')!.lastChild as Text;
    setCursorInText(root, worldNode, 0);

    expect(getCaretCleanOffset(root)).toBe(6);

    document.body.removeChild(root);
  });

  it('restores the caret in clean text coordinates', () => {
    const root = document.createElement('div');
    root.innerHTML = `<p>Hello <span data-redline="delete" contenteditable="false" style="${REDLINE_STYLES.delete}">removed</span> world</p>`;
    document.body.appendChild(root);

    setCaretCleanOffset(root, 6);

    const selection = window.getSelection()!;
    expect(selection.anchorNode?.textContent).toBe(' world');
    expect(selection.anchorOffset).toBe(0);

    document.body.removeChild(root);
  });
});
