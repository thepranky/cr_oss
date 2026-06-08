// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildRedline } from '../redline';
import {
  extractDominantFormatting,
  wrapWithDominantInline,
} from '../redline/dominantStyle';

describe('dominantStyle', () => {
  it('extractDominantFormatting picks the most common inline and block styles', () => {
    const html = `
      <p style="margin-bottom:12pt;line-height:115%;">Intro</p>
      <p style="margin-bottom:12pt;line-height:115%;">
        <span style="font-family:Calibri;font-size:11pt;">Alpha</span>
        <span style="font-family:Calibri;font-size:11pt;">Beta</span>
        <span style="font-family:Arial;font-size:10pt;">Gamma</span>
      </p>
    `;

    const dominant = extractDominantFormatting(html);
    expect(dominant?.inlineStyle).toContain('font-family:Calibri');
    expect(dominant?.inlineStyle).toContain('font-size:11pt');
    expect(dominant?.blockStyle).toContain('margin-bottom:12pt');
    expect(dominant?.blockStyle).toContain('line-height:115%');
  });

  it('wrapWithDominantInline wraps plain text with the dominant inline style', () => {
    const wrapped = wrapWithDominantInline('added', {
      inlineStyle: 'font-family:Calibri;font-size:11pt',
      blockStyle: '',
    });
    expect(wrapped).toContain('font-family:Calibri');
    expect(wrapped).toContain('added');
  });

  it('buildRedline applies dominant inline style to plain inserts', () => {
    const baseline =
      '<p style="margin-bottom:12pt;"><span style="font-family:Calibri;font-size:11pt;">Hello world</span></p>';
    const current =
      '<p style="margin-bottom:12pt;"><span style="font-family:Calibri;font-size:11pt;">Hello brave world</span></p>';

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
      inlineDiff: true,
    });

    expect(result.html).toContain('font-family:Calibri');
    expect(result.html).toContain('brave');
  });
});
