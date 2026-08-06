import assert from 'node:assert/strict';
import test from 'node:test';

import { extractSupportingFiles, isSupportedSupportingFile, MAX_EXTRACTED_CHARS_PER_FILE } from '../lib/supporting-files.ts';

test('TXT supporting files are extracted and bounded', async () => {
  const file = new File(['Study chapters 3 and 4. Focus on cellular respiration.'], 'notes.txt', { type: 'text/plain' });
  const [result] = await extractSupportingFiles([{ id: 'notes', file }]);
  assert.equal(result.status, 'extracted');
  assert.match(result.text, /cellular respiration/);
  assert.equal(result.contentMayBeMissing, false);
});

test('long extracted text is marked incomplete rather than silently cut', async () => {
  const file = new File(['x'.repeat(MAX_EXTRACTED_CHARS_PER_FILE + 50)], 'long.txt', { type: 'text/plain' });
  const [result] = await extractSupportingFiles([{ id: 'long', file }]);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.text.length, MAX_EXTRACTED_CHARS_PER_FILE);
  assert.equal(result.contentMayBeMissing, true);
});

test('unsupported or unreadable files return a non-blocking unreadable result', async () => {
  const image = new File(['not an image'], 'scan.png', { type: 'image/png' });
  assert.equal(isSupportedSupportingFile(image), false);
  const [result] = await extractSupportingFiles([{ id: 'scan', file: image }]);
  assert.equal(result.status, 'unreadable');
  assert.equal(result.text, '');
});
