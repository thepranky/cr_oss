// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildRedline } from '../redline';
import { extractBodyWrapper, finalizeBodyHtml } from '../redline/bodyEnvelope';
import { replaceRegionInHtml, captureSelectionAnchors } from '../outlook/bodyRegion';
import { buildPlainTextMap } from '../redline/htmlPlainMap';

describe('bodyEnvelope', () => {
  it('extractBodyWrapper finds nested Outlook compose font wrapper', () => {
    const html =
      '<div dir="ltr" style="font-family:Arial,sans-serif;font-size:10pt;">' +
      '<div class="elementToProof">Hi Chris,</div>' +
      '<div class="elementToProof">Thanks for your note.</div>' +
      '</div>';

    const wrapper = extractBodyWrapper(html);
    expect(wrapper?.open).toContain('font-family:Arial');
    expect(wrapper?.open).toContain('dir="ltr"');
    expect(finalizeBodyHtml(html, '<p>Updated</p>')).toBe(
      `${wrapper!.open}<p>Updated</p>${wrapper!.close}`,
    );
  });

  it('buildRedline preserves Outlook wrapper and inherited font on full body', () => {
    const baseline =
      '<div dir="ltr" style="font-family:Arial,sans-serif;font-size:10pt;">' +
      '<div class="elementToProof">Hi Chris,</div>' +
      '<div class="elementToProof">Dear James,</div>' +
      '<ol><li>First step</li><li>Second step</li></ol>' +
      '<div class="elementToProof">Best, Bhavya</div>' +
      '</div>';
    const current = baseline.replace('Second step', 'Second step revised');

    const result = buildRedline(baseline, current, {
      baselineIsHtml: true,
      currentIsHtml: true,
      envelopeHtml: baseline,
    });

    expect(result.html).toContain('font-family:Arial');
    expect(result.html).toContain('dir="ltr"');
    expect(result.html).toContain('elementToProof');
    expect(result.html).toContain('<ol');
    expect(result.html).toContain('revised');
  });

  it('replaceRegionInHtml keeps wrapper and styling outside replaced region', () => {
    const bodyHtml =
      '<div dir="ltr" style="font-family:Arial,sans-serif;font-size:10pt;">' +
      '<div class="elementToProof">Hi Chris,</div>' +
      '<div class="elementToProof">Dear James,</div>' +
      '<div class="elementToProof">Please review.</div>' +
      '<div class="elementToProof">Best, Bhavya</div>' +
      '</div>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const selectionPlain = buildPlainTextMap(
      '<div class="elementToProof">Dear James,</div><div class="elementToProof">Please review.</div>',
    ).text;
    const anchors = captureSelectionAnchors(bodyText, selectionPlain);
    expect(anchors).not.toBeNull();

    const replacement =
      '<div class="elementToProof">Dear James,</div>' +
      '<div class="elementToProof"><span style="color:blue;text-decoration:underline">Please review the draft.</span></div>';
    const updated = replaceRegionInHtml(bodyHtml, anchors!, replacement);

    expect(updated).toContain('font-family:Arial');
    expect(updated).toContain('dir="ltr"');
    expect(updated).toContain('Hi Chris,');
    expect(updated).toContain('Best, Bhavya');
    expect(updated).toContain('elementToProof');
    expect(updated).toContain('Please review the draft');
  });
});
