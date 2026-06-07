import { describe, expect, it } from 'vitest';
import { acceptAllAsHtml, acceptAllFromParts } from '../redline/acceptAll';
import { buildRedline } from '../redline';
import { REDLINE_STYLES } from '../redline/types';

describe('acceptAll', () => {
  it('keeps equal and insert parts, drops deletes', () => {
    const parts = [
      { op: 'equal' as const, value: 'Hello ' },
      { op: 'delete' as const, value: 'old ' },
      { op: 'insert' as const, value: 'brave ' },
      { op: 'equal' as const, value: 'world' },
    ];

    expect(acceptAllFromParts(parts)).toBe('Hello brave world');
  });

  it('produces clean HTML without redline spans', () => {
    const parts = [
      { op: 'equal' as const, value: 'Hi' },
      { op: 'insert' as const, value: ' there' },
    ];

    expect(acceptAllAsHtml(parts)).toBe('<div>Hi there</div>');
  });

  it('buildRedline returns consistent clean output', () => {
    const result = buildRedline('Hello world', 'Hello brave world');
    expect(result.changed).toBe(true);
    expect(result.cleanText).toBe('Hello brave world');
    expect(result.html).toContain(REDLINE_STYLES.insert);
  });
});
