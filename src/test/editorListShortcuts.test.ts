// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { tryExpandListShortcut, tryHandleListEnter } from '../components/editorListShortcuts';

function setCursorInText(_root: HTMLElement, textNode: Text, offset: number): void {
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('editorListShortcuts', () => {
  it('expands * into a bullet list item', () => {
    const root = document.createElement('div');
    root.contentEditable = 'true';
    document.body.appendChild(root);

    const text = document.createTextNode('*');
    root.appendChild(text);
    setCursorInText(root, text, 1);

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const handled = tryExpandListShortcut(event, root);

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(root.querySelector('ul li')).not.toBeNull();

    document.body.removeChild(root);
  });

  it('expands 1. into a numbered list item', () => {
    const root = document.createElement('div');
    root.contentEditable = 'true';
    document.body.appendChild(root);

    const text = document.createTextNode('1.');
    root.appendChild(text);
    setCursorInText(root, text, 2);

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const handled = tryExpandListShortcut(event, root);

    expect(handled).toBe(true);
    expect(root.querySelector('ol li')).not.toBeNull();

    document.body.removeChild(root);
  });

  it('creates a new list item on Enter', () => {
    const root = document.createElement('div');
    root.innerHTML = '<ul><li>First item</li></ul>';
    document.body.appendChild(root);

    const item = root.querySelector('li')!;
    const textNode = item.firstChild as Text;
    setCursorInText(root, textNode, textNode.length);

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const handled = tryHandleListEnter(event, root);

    expect(handled).toBe(true);
    expect(root.querySelectorAll('li').length).toBe(2);

    document.body.removeChild(root);
  });
});
