import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from '../redline/normalize';
import { pasteContentFromClipboard, preprocessWordHtml, sanitizeWordHtml } from '../redline/sanitizeWordHtml';

const WORD_SNIPPET = `
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]-->
<p class="MsoNormal" style="mso-margin-top-alt:auto;mso-margin-bottom-alt:auto">
  Hello <b>world</b>
  <o:p></o:p>
</p>
<ul style="mso-list:l0 level1 lfo1">
  <li class="MsoNormal">First</li>
  <li class="MsoNormal"><strong>Second</strong></li>
</ul>
`;

describe('sanitizeWordHtml', () => {
  it('strips conditional comments and o:p tags', () => {
    const result = sanitizeWordHtml(WORD_SNIPPET);
    expect(result).not.toContain('o:p');
    expect(result).not.toContain('<!--[if');
    expect(result).not.toContain('mso-');
  });

  it('keeps semantic tags for bold and lists', () => {
    const result = sanitizeWordHtml(WORD_SNIPPET);
    expect(result).toContain('<b>world</b>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
    expect(result).toContain('<b>Second</b>');
  });

  it('preprocessWordHtml removes style and class attributes', () => {
    const preprocessed = preprocessWordHtml(WORD_SNIPPET);
    expect(preprocessed).not.toContain('class=');
    expect(preprocessed).not.toContain('style=');
  });

  it('still produces plain text suitable for diffing', () => {
    const sanitized = sanitizeWordHtml(WORD_SNIPPET);
    const plain = htmlToPlainText(sanitized);
    expect(plain).toContain('Hello world');
    expect(plain).toContain('First');
    expect(plain).toContain('Second');
  });
});

describe('pasteContentFromClipboard', () => {
  it('prefers sanitized HTML from the clipboard', () => {
    const clipboard = {
      items: [],
      getData: (type: string) => {
        if (type === 'text/html') return WORD_SNIPPET;
        if (type === 'text/plain') return 'Hello world';
        return '';
      },
    } as unknown as DataTransfer;

    const content = pasteContentFromClipboard(clipboard);
    expect(content).toContain('<b>world</b>');
    expect(content).not.toContain('mso-');
  });

  it('falls back to plain text wrapped in paragraphs', () => {
    const clipboard = {
      items: [],
      getData: (type: string) => (type === 'text/plain' ? 'Line one\nLine two' : ''),
    } as unknown as DataTransfer;

    expect(pasteContentFromClipboard(clipboard)).toBe('<p>Line one</p><p>Line two</p>');
  });
});
