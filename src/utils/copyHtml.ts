/** Copy HTML to the clipboard with a plain-text fallback for older hosts. */
export async function copyHtmlToClipboard(html: string, plainText?: string): Promise<void> {
  const plain = plainText ?? htmlToPlainText(html);

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const plainBlob = new Blob([plain], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': plainBlob,
      }),
    ]);
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plain);
    return;
  }

  const container = document.createElement('div');
  container.innerHTML = html;
  container.setAttribute('contenteditable', 'true');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  document.body.appendChild(container);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(container);
  selection?.removeAllRanges();
  selection?.addRange(range);

  const copied = document.execCommand('copy');
  document.body.removeChild(container);

  if (!copied) {
    throw new Error('Could not copy to clipboard.');
  }
}

function htmlToPlainText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, '');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}
