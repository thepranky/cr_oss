// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ooxmlDocumentToHtml } from '../redline/wordOoxml';

const SAMPLE_DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Hello </w:t></w:r>
      <w:ins><w:r><w:t>brave </w:t></w:r></w:ins>
      <w:r><w:t>world</w:t></w:r>
    </w:p>
    <w:p>
      <w:del><w:r><w:delText>removed</w:delText></w:r></w:del>
    </w:p>
  </w:body>
</w:document>`;

describe('wordOoxml', () => {
  it('converts w:ins and w:del to redline spans', () => {
    const html = ooxmlDocumentToHtml(SAMPLE_DOCUMENT);
    expect(html).not.toBeNull();
    expect(html).toContain('color:blue');
    expect(html).toContain('brave');
    expect(html).toContain('color:red');
    expect(html).toContain('removed');
  });

  it('returns null when no revision markup is present', () => {
    const plainDoc = `<?xml version="1.0"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>Plain</w:t></w:r></w:p></w:body>
      </w:document>`;
    expect(ooxmlDocumentToHtml(plainDoc)).toBeNull();
  });
});
