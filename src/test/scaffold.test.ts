import { describe, expect, it } from 'vitest';
import { REDLINE_STYLES } from '../redline/types';

describe('redline scaffolding', () => {
  it('exports email-safe inline style constants', () => {
    expect(REDLINE_STYLES.delete).toContain('line-through');
    expect(REDLINE_STYLES.insert).toContain('underline');
  });
});
