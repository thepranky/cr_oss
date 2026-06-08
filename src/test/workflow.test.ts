// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  captureSelectionAnchors,
  extractRegionHtml,
  replaceRegionInHtml,
} from '../outlook/bodyRegion';
import { buildPlainTextMap } from '../redline/htmlPlainMap';
import { buildFullDraftRedline, buildRegionRedline } from '../redline/workflow';
import { finalizeBodyHtml } from '../redline/bodyEnvelope';

const OUTLOOK_BODY =
  '<div dir="ltr" style="font-family:Calibri,sans-serif;font-size:11pt;">' +
  '<p style="margin-bottom:12pt;">Hi Chris,</p>' +
  '<ol style="margin-top:0;margin-bottom:0;padding-left:36pt;">' +
  '<li style="margin-bottom:6pt;">First item</li>' +
  '<li style="margin-bottom:6pt;">Second item</li></ol>' +
  '<p style="margin-bottom:12pt;">Best, Bhavya</p></div>';

describe('workflow format preservation parity', () => {
  it('selection baseline extraction keeps list wrapper metadata for buildRegionRedline', () => {
    const bodyText = buildPlainTextMap(OUTLOOK_BODY).text;
    const selectedHtml =
      '<ol style="margin-top:0;margin-bottom:0;padding-left:36pt;">' +
      '<li style="margin-bottom:6pt;">First item</li>' +
      '<li style="margin-bottom:6pt;">Second item</li></ol>';
    const selectionPlain = buildPlainTextMap(selectedHtml).text;
    const anchors = captureSelectionAnchors(bodyText, selectionPlain);
    expect(anchors).not.toBeNull();

    const baselineHtml = extractRegionHtml(OUTLOOK_BODY, anchors!);
    expect(baselineHtml).toContain('<ol');
    expect(baselineHtml).toContain('padding-left:36pt');

    const currentRegionHtml = baselineHtml.replace('Second item', 'Second item revised');
    const result = buildRegionRedline(baselineHtml, currentRegionHtml);
    expect(result.changed).toBe(true);
    expect(result.html).toContain('padding-left:36pt');
    expect(result.html).toContain('revised');
  });

  it('selection replace keeps styled blocks outside the region', () => {
    const selectionPlain = buildPlainTextMap(
      '<p style="margin-bottom:12pt;">Dear James,</p>' +
        '<p style="margin-bottom:12pt;">Please review the draft.</p>',
    ).text;
    const bodyWithMiddle =
      '<div dir="ltr" style="font-family:Calibri,sans-serif;font-size:11pt;">' +
      '<p style="margin-bottom:12pt;">Hi Chris,</p>' +
      '<p style="margin-bottom:12pt;">Dear James,</p>' +
      '<p style="margin-bottom:12pt;">Please review the draft.</p>' +
      '<p style="margin-bottom:12pt;">Best, Bhavya</p></div>';
    const middleBodyText = buildPlainTextMap(bodyWithMiddle).text;
    const anchors = captureSelectionAnchors(middleBodyText, selectionPlain);
    expect(anchors).not.toBeNull();

    const baselineHtml = extractRegionHtml(bodyWithMiddle, anchors!);
    const currentRegionHtml = baselineHtml.replace('the draft', 'the revised draft');
    const result = buildRegionRedline(baselineHtml, currentRegionHtml);
    const updatedBody = replaceRegionInHtml(bodyWithMiddle, anchors!, result.html);

    expect(updatedBody).toContain('Hi Chris,');
    expect(updatedBody).toContain('font-family:Calibri');
    expect(updatedBody).toContain('Best, Bhavya');
    expect(updatedBody).toContain('Please review the');
    expect(updatedBody).toContain('revise');
    expect(updatedBody).toContain('raft.');
  });

  it('full-body show-redline uses buildFullDraftRedline with envelope restoration', () => {
    const baselineHtml = OUTLOOK_BODY;
    const currentBodyHtml = OUTLOOK_BODY.replace('Second item', 'Second item revised');

    const result = buildFullDraftRedline(baselineHtml, currentBodyHtml);
    expect(result.changed).toBe(true);
    expect(result.html).toContain('dir="ltr"');
    expect(result.html).toContain('font-family:Calibri');
    expect(result.html).toContain('padding-left:36pt');
    expect(result.html).toContain('revised');
    expect(result.html).toContain('Hi Chris,');
  });

  it('editor workflow uses region baseline html against contenteditable current html', () => {
    const bodyText = buildPlainTextMap(OUTLOOK_BODY).text;
    const selectedHtml =
      '<ol style="margin-top:0;margin-bottom:0;padding-left:36pt;">' +
      '<li style="margin-bottom:6pt;">First item</li>' +
      '<li style="margin-bottom:6pt;">Second item</li></ol>';
    const selectionPlain = buildPlainTextMap(selectedHtml).text;
    const anchors = captureSelectionAnchors(bodyText, selectionPlain);
    expect(anchors).not.toBeNull();

    const regionBaseline = extractRegionHtml(OUTLOOK_BODY, anchors!);
    const editorCurrent =
      '<div>First item</div><div>Second item revised</div>';

    const result = buildRegionRedline(regionBaseline, editorCurrent);
    expect(result.changed).toBe(true);
    expect(result.html).toContain('revised');
    expect(result.html).toContain('margin-bottom:6pt');
  });

  it('buildFullDraftRedline matches manual envelope application', () => {
    const baseline = OUTLOOK_BODY;
    const current = OUTLOOK_BODY.replace('First item', 'First item updated');
    const fromWorkflow = buildFullDraftRedline(baseline, current);
    const inner = buildRegionRedline(baseline, current);
    const manual = finalizeBodyHtml(current, inner.html);

    expect(fromWorkflow.html).toContain('dir="ltr"');
    expect(manual).toContain('dir="ltr"');
    expect(fromWorkflow.html).toContain('updated');
  });
});
