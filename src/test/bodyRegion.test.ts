// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  captureComposeSelectionAnchors,
  captureSelectionAnchors,
  extractRegionHtml,
  findAllSelectionRegions,
  locateRegionInPlainText,
  locateSelectionInPlainText,
  regionMatchesAnchors,
  replaceRegionInHtml,
} from '../outlook/bodyRegion';
import { buildPlainTextMap } from '../redline/htmlPlainMap';
import { buildRegionRedline } from '../redline/workflow';
import { REDLINE_STYLES } from '../redline/types';

describe('bodyRegion', () => {
  it('captures and relocates a selection using prefix/suffix anchors', () => {
    const body = 'Hello world. The quick brown fox jumps. Goodbye.';
    const selection = 'The quick brown fox jumps.';
    const anchors = captureSelectionAnchors(body, selection);
    expect(anchors).not.toBeNull();

    const edited = 'Hello world. The quick brown cat jumps. Goodbye.';
    const region = locateRegionInPlainText(edited, anchors!);
    expect(region).not.toBeNull();
    expect(edited.slice(region!.start, region!.end)).toBe('The quick brown cat jumps.');
  });

  it('matches Outlook list selections with bullet prefixes against HTML plain text', () => {
    const bodyHtml =
      '<p>Now trying again!</p><ul><li>Let\'s see if this retainssss</li><li>Does it?</li><li>Maybe</li></ul>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const outlookSelection =
      "• Let's see if this retainssss\r\n• Does it?\r\n• Maybe";

    const region = locateSelectionInPlainText(bodyText, outlookSelection);
    expect(region).not.toBeNull();

    const anchors = captureSelectionAnchors(bodyText, outlookSelection);
    expect(anchors).not.toBeNull();
    expect(bodyText.slice(anchors!.baselineText.length > 0 ? region!.start : 0, region!.end)).toBe(
      bodyText.slice(region!.start, region!.end),
    );
    expect(anchors!.baselineText).toContain("Let's see if this retainssss");
    expect(anchors!.baselineText).toContain('Maybe');
  });

  it('matches selection using HTML-derived plain text from selected fragment', () => {
    const bodyHtml = '<p>Intro</p><ul><li>Alpha</li><li>Beta</li></ul><p>Outro</p>';
    const selectedHtml = '<ul><li>Alpha</li><li>Beta</li></ul>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const selectionPlain = buildPlainTextMap(selectedHtml).text;

    const anchors = captureSelectionAnchors(bodyText, selectionPlain);
    expect(anchors).not.toBeNull();
    expect(anchors!.baselineText).toBe('Alpha\nBeta');
  });

  it('preserves styled blocks outside the replaced region', () => {
    const bodyHtml =
      '<p style="margin-bottom:12pt;font-family:Calibri;">Hi Chris,</p>' +
      '<p style="margin-bottom:12pt;">Thanks for your note.</p>' +
      '<p style="margin-bottom:12pt;">Dear James,</p>' +
      '<p style="margin-bottom:12pt;">Please review the draft.</p>' +
      '<p style="margin-bottom:12pt;">Best, Bhavya</p>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const selectionPlain = buildPlainTextMap(
      '<p style="margin-bottom:12pt;">Dear James,</p><p style="margin-bottom:12pt;">Please review the draft.</p>',
    ).text;

    const anchors = captureSelectionAnchors(bodyText, selectionPlain);
    expect(anchors).not.toBeNull();

    const replacement =
      '<p style="margin-bottom:12pt;"><span style="color:blue;text-decoration:underline">Dear James,</span></p>' +
      '<p style="margin-bottom:12pt;"><span style="color:blue;text-decoration:underline">Please review the revised draft.</span></p>';
    const updated = replaceRegionInHtml(bodyHtml, anchors!, replacement);

    expect(updated).toContain('Hi Chris,');
    expect(updated).toContain('margin-bottom:12pt');
    expect(updated).toContain('font-family:Calibri');
    expect(updated).toContain('Best, Bhavya');
    expect(updated).toContain('revised draft');
    expect(updated).not.toContain('Please review the draft.');
  });

  it('replaces only the anchored region in HTML', () => {
    const bodyHtml = '<p>Hello world.</p><p>The quick brown fox.</p><p>Goodbye.</p>';
    const anchors = captureSelectionAnchors(
      'Hello world.\nThe quick brown fox.\nGoodbye.',
      'The quick brown fox.',
    );
    expect(anchors).not.toBeNull();

    const replacement = `<span style="${REDLINE_STYLES.insert}">The quick brown cat.</span>`;
    const updated = replaceRegionInHtml(bodyHtml, anchors!, replacement);

    expect(updated).toContain('Hello world.');
    expect(updated).toContain('The quick brown cat.');
    expect(updated).toContain('Goodbye.');
    expect(updated).not.toContain('brown fox');
  });

  it('disambiguates duplicate text using HTML and replaces the selected occurrence in place', () => {
    const bodyHtml =
      '<p>Please review the draft.</p>' +
      '<p>Middle paragraph.</p>' +
      '<p style="color:red">Please review the draft.</p>' +
      '<p>Outro paragraph.</p>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const selectedHtml = '<p style="color:red">Please review the draft.</p>';
    const selectionPlain = buildPlainTextMap(selectedHtml).text;

    expect(findAllSelectionRegions(bodyText, selectionPlain).length).toBeGreaterThanOrEqual(2);

    const anchors = captureSelectionAnchors(bodyText, selectionPlain, {
      bodyHtml,
      selectionHtml: selectedHtml,
    });
    expect(anchors).not.toBeNull();
    expect(anchors!.regionStart).toBeGreaterThan(0);

    const replacement =
      '<p style="color:red"><span style="color:blue;text-decoration:underline">Please review the revised draft.</span></p>';
    const updated = replaceRegionInHtml(bodyHtml, anchors!, replacement);

    expect(updated).toContain('Middle paragraph.');
    expect(updated).toContain('Outro paragraph.');
    expect(updated).toContain('revised draft');
    expect(updated).toContain('color:red');
    expect(updated.match(/Please review the draft\./g)?.length).toBe(1);
    expect(updated.indexOf('revised draft')).toBeGreaterThan(updated.indexOf('Middle paragraph.'));
  });

  it('relocates near regionStart after edits inside the selected region', () => {
    const bodyHtml =
      '<p>Hi Chris,</p><p>Please review the draft.</p><p>Best, Bhavya</p>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const anchors = captureSelectionAnchors(bodyText, 'Please review the draft.', { bodyHtml });
    expect(anchors).not.toBeNull();

    const editedHtml =
      '<p>Hi Chris,</p><p>Please review the heavily revised draft.</p><p>Best, Bhavya</p>';
    const editedText = buildPlainTextMap(editedHtml).text;
    const region = locateRegionInPlainText(editedText, anchors!);
    expect(region).not.toBeNull();

    const replacement = '<p>Please review the heavily <span style="color:blue">revised</span> draft.</p>';
    const updated = replaceRegionInHtml(editedHtml, anchors!, replacement);

    expect(updated).toContain('Hi Chris,');
    expect(updated).toContain('Best, Bhavya');
    expect(updated).not.toContain('heavily revised draft.');
    expect(updated).toContain('color:blue');
  });

  it('prefers text coercion when HTML selection is a partial fragment', () => {
    const bodyHtml =
      '<p>Hi Cr_oss,</p><p>Dear James, I hope you are well.</p>' +
      '<p>Further to our call earlier today. I wanted to set out our understanding of the proposed next steps.</p>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const selectedText =
      'Further to our call earlier today. I wanted to set out our understanding of the proposed next steps.';
    const selectedHtml = 'r_oss';

    const anchors = captureComposeSelectionAnchors(bodyText, selectedText, {
      bodyHtml,
      selectionHtml: selectedHtml,
    });

    expect(anchors).not.toBeNull();
    expect(anchors!.baselineText).toContain('Further to our call earlier today');
    expect(anchors!.baselineText).not.toBe('r_oss');
  });

  it('editor insert round-trip replaces the selected middle paragraph in place', () => {
    const bodyHtml =
      '<div dir="ltr" style="font-family:Calibri,sans-serif;font-size:11pt;">' +
      '<p style="margin-bottom:12pt;">Hi Chris,</p>' +
      '<p style="margin-bottom:12pt;">Please review the draft.</p>' +
      '<p style="margin-bottom:12pt;">Best, Bhavya</p>' +
      '</div>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const selectedText = 'Please review the draft.';
    const selectedHtml = '<p style="margin-bottom:12pt;">Please review the draft.</p>';

    const anchors = captureComposeSelectionAnchors(bodyText, selectedText, {
      bodyHtml,
      selectionHtml: selectedHtml,
    });
    expect(anchors).not.toBeNull();
    expect(anchors!.regionStart).toBeGreaterThan(0);

    const baselineHtml = extractRegionHtml(bodyHtml, anchors!);
    const editedHtml = baselineHtml.replace('the draft', 'the revised draft');
    const result = buildRegionRedline(baselineHtml, editedHtml);
    expect(result.changed).toBe(true);

    const updated = replaceRegionInHtml(bodyHtml, anchors!, result.html);

    expect(updated).toContain('Hi Chris,');
    expect(updated).toContain('Best, Bhavya');
    expect(updated).toContain('font-family:Calibri');
    expect(updated).toContain('revised');
    expect(updated).not.toMatch(/Please review the draft\.(?![\s\S]*revised)/);
    expect(updated.indexOf('revised')).toBeGreaterThan(updated.indexOf('Hi Chris,'));
    expect(updated.indexOf('revised')).toBeLessThan(updated.indexOf('Best, Bhavya'));
  });

  it('uses capture-time plain text offsets when the draft body is unchanged', () => {
    const bodyHtml =
      '<div dir="ltr" style="font-family:Calibri,sans-serif;font-size:11pt;">' +
      '<p>Hi Chris,</p>' +
      '<p>Please review the draft.</p>' +
      '<p>Best, Bhavya</p>' +
      '</div>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const anchors = captureSelectionAnchors(bodyText, 'Please review the draft.', { bodyHtml });
    expect(anchors).not.toBeNull();

    const region = locateRegionInPlainText(bodyText, anchors!, { captureBodyPlain: bodyText });
    expect(region).toEqual({
      start: anchors!.regionStart,
      end: anchors!.regionEnd,
    });
  });

  it('disambiguates duplicate baseline text using prefix and suffix anchors', () => {
    const bodyHtml =
      '<p>Please review the draft.</p>' +
      '<p>Middle paragraph.</p>' +
      '<p style="color:red">Please review the draft.</p>' +
      '<p>Outro paragraph.</p>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const selectedHtml = '<p style="color:red">Please review the draft.</p>';
    const selectionPlain = buildPlainTextMap(selectedHtml).text;

    const anchors = captureSelectionAnchors(bodyText, selectionPlain, {
      bodyHtml,
      selectionHtml: selectedHtml,
    });
    expect(anchors).not.toBeNull();

    const matches = findAllSelectionRegions(bodyText, anchors!.baselineText).filter((region) =>
      regionMatchesAnchors(bodyText, region, anchors!),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].start).toBe(anchors!.regionStart);

    const replacement =
      '<p style="color:red"><span style="color:blue;text-decoration:underline">Please review the revised draft.</span></p>';
    const updated = replaceRegionInHtml(bodyHtml, anchors!, replacement, {
      captureBodyPlain: bodyText,
    });

    expect(updated.match(/Please review the draft\./g)?.length).toBe(1);
    expect(updated).toContain('revised');
    expect(updated.indexOf('revised')).toBeGreaterThan(updated.indexOf('Middle paragraph.'));
  });

  it('preserves numbered list and font styling outside replaced region on insert', () => {
    const bodyHtml =
      '<div dir="ltr" style="font-family:Calibri,sans-serif;font-size:11pt;">' +
      '<p style="margin-bottom:12pt;font-family:Calibri,sans-serif;">Hi Chris,</p>' +
      '<ol style="margin-top:0;margin-bottom:0;padding-left:36pt;">' +
      '<li style="margin-bottom:6pt;">First item</li>' +
      '<li style="margin-bottom:6pt;">Second item</li>' +
      '</ol>' +
      '<p style="margin-bottom:12pt;font-family:Calibri,sans-serif;">Best, Bhavya</p>' +
      '</div>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const selectedHtml =
      '<ol style="margin-top:0;margin-bottom:0;padding-left:36pt;">' +
      '<li style="margin-bottom:6pt;">First item</li>' +
      '<li style="margin-bottom:6pt;">Second item</li></ol>';
    const selectionPlain = buildPlainTextMap(selectedHtml).text;

    const anchors = captureSelectionAnchors(bodyText, selectionPlain, {
      bodyHtml,
      selectionHtml: selectedHtml,
    });
    expect(anchors).not.toBeNull();

    const baselineHtml = extractRegionHtml(bodyHtml, anchors!, { captureBodyPlain: bodyText });
    const result = buildRegionRedline(
      baselineHtml,
      baselineHtml.replace('Second item', 'Second item revised'),
    );
    const updated = replaceRegionInHtml(bodyHtml, anchors!, result.html, {
      captureBodyPlain: bodyText,
    });

    expect(updated).toContain('<ol');
    expect(updated).toContain('padding-left:36pt');
    expect(updated).toContain('font-family:Calibri');
    expect(updated).toContain('Hi Chris,');
    expect(updated).toContain('Best, Bhavya');
    expect(updated).toContain('revised');
  });

  it('replaces in place when block alignment drifts across spacer paragraphs', () => {
    const bodyHtml =
      '<div dir="ltr" style="font-family:Calibri,sans-serif;font-size:11pt;">' +
      '<p style="margin-bottom:12pt;"><span style="font-family:Calibri">Hi Chris,</span></p>' +
      '<p style="margin-bottom:12pt;">&nbsp;</p>' +
      '<p style="margin-bottom:12pt;"><span style="font-family:Calibri">Please review the draft.</span></p>' +
      '<p style="margin-bottom:12pt;"><span style="font-family:Calibri">Best, Bhavya</span></p>' +
      '</div>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const anchors = captureComposeSelectionAnchors(bodyText, 'Please review the draft.', {
      bodyHtml,
      selectionHtml: '<p style="margin-bottom:12pt;">Please review the draft.</p>',
    });
    expect(anchors).not.toBeNull();

    const baselineHtml = extractRegionHtml(bodyHtml, anchors!, { captureBodyPlain: bodyText });
    const result = buildRegionRedline(
      baselineHtml,
      baselineHtml.replace('the draft', 'the revised draft'),
    );
    const updated = replaceRegionInHtml(bodyHtml, anchors!, result.html, {
      captureBodyPlain: bodyText,
    });

    expect(updated).toContain('Hi Chris,');
    expect(updated).toContain('Best, Bhavya');
    expect(updated).toContain('revised');
    expect(updated.indexOf('revised')).toBeGreaterThan(updated.indexOf('Hi Chris,'));
    expect(updated.indexOf('revised')).toBeLessThan(updated.indexOf('Best, Bhavya'));
    expect(updated.match(/Please review the draft\./g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('anchors round-trip through relocation after capture', () => {
    const bodyHtml =
      '<p>Please review the draft.</p><p>Middle paragraph.</p><p>Please review the draft.</p>';
    const bodyText = buildPlainTextMap(bodyHtml).text;
    const selectedHtml = '<p>Please review the draft.</p>';
    const selectionPlain = buildPlainTextMap(selectedHtml).text;

    const anchors = captureSelectionAnchors(bodyText, selectionPlain, {
      bodyHtml,
      selectionHtml: selectedHtml,
    });
    expect(anchors).not.toBeNull();

    const region = locateRegionInPlainText(bodyText, anchors!);
    expect(region).not.toBeNull();
    expect(region!.start).toBe(anchors!.regionStart);
    expect(bodyText.slice(region!.start, region!.end)).toBe(anchors!.baselineText);
  });
});
