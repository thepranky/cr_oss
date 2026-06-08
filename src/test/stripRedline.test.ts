// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildRedline } from '../redline';
import { stripRedlineMarkup } from '../redline/stripRedline';

describe('stripRedlineMarkup', () => {
  it('keeps inserted text and removes deleted text', () => {
    const result = buildRedline('Hello world', 'Hello brave world');
    const stripped = stripRedlineMarkup(result.html);

    expect(stripped).toContain('Hello brave world');
    expect(stripped).not.toContain('color:red');
    expect(stripped).not.toMatch(/\bworld\b.*\bworld\b/);
  });
});
