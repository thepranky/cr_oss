import { describe, expect, it } from 'vitest';
import { REDLINE_STYLES } from '../redline/types';
import { escapeHtml, renderRedlineHtml } from '../redline/render';

describe('render', () => {
  it('applies delete and insert inline styles', () => {
    const html = renderRedlineHtml([
      { op: 'equal', value: 'Hello ' },
      { op: 'delete', value: 'old' },
      { op: 'insert', value: 'new' },
    ]);

    expect(html).toContain(`style="${REDLINE_STYLES.delete}"`);
    expect(html).toContain(`style="${REDLINE_STYLES.insert}"`);
    expect(html).toContain('>old<');
    expect(html).toContain('>new<');
    expect(html.startsWith('<div>')).toBe(true);
    expect(html.endsWith('</div>')).toBe(true);
  });

  it('escapes HTML in user text to prevent XSS', () => {
    const html = renderRedlineHtml([{ op: 'insert', value: '<script>alert(1)</script>' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes special characters in equal parts', () => {
    const html = renderRedlineHtml([{ op: 'equal', value: 'a & b < c' }]);
    expect(html).toContain('a &amp; b &lt; c');
  });

  it('converts newlines to br tags', () => {
    const html = renderRedlineHtml([{ op: 'equal', value: 'Line one\nLine two' }]);
    expect(html).toContain('Line one<br>Line two');
  });

  it('escapeHtml handles all core entities', () => {
    expect(escapeHtml(`<&">`)).toBe('&lt;&amp;&quot;&gt;');
  });
});
