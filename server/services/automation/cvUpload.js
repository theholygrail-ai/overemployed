/**
 * Choose DOCX vs PDF for <input type="file"> based on `accept`, with fallback if upload fails.
 */

/**
 * @param {string|null|undefined} accept - value of input accept attribute
 * @param {{ docxPath: string, pdfPath: string }} assets
 * @returns {('pdf'|'docx')[]} order to try
 */
export function pickCvFormatOrder(accept) {
  const a = (accept || '').toLowerCase();
  const wantsPdf =
    a.includes('.pdf') ||
    a.includes('application/pdf') ||
    /\bpdf\b/.test(a);
  const wantsWord =
    a.includes('.docx') ||
    a.includes('.doc') ||
    a.includes('wordprocessingml') ||
    a.includes('msword') ||
    a.includes('application/vnd.openxmlformats') ||
    a.includes('application/msword');

  if (wantsPdf && !wantsWord) return ['pdf', 'docx'];
  if (wantsWord && !wantsPdf) return ['docx', 'pdf'];
  if (wantsPdf && wantsWord) return ['pdf', 'docx'];
  return ['pdf', 'docx'];
}

export function pathForFormat(assets, format) {
  return format === 'pdf' ? assets.pdfPath : assets.docxPath;
}

/**
 * Playwright: set files on a FileChooser input element handle.
 */
export async function setCvFilesPlaywright(input, assets, onProgress) {
  const accept = await input.getAttribute('accept').catch(() => '');
  const order = pickCvFormatOrder(accept);
  let lastErr = null;
  for (const fmt of order) {
    const p = pathForFormat(assets, fmt);
    if (!p) continue;
    try {
      await input.setInputFiles(p);
      onProgress?.(`Resume/CV uploaded (${fmt.toUpperCase()})`);
      return { ok: true, path: p, format: fmt };
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('No DOCX or PDF path available for upload');
}

/**
 * Puppeteer: uploadFile on each file input.
 */
export async function setCvFilesPuppeteer(input, assets, onProgress) {
  const accept = await input.evaluate((el) => el.getAttribute('accept') || '').catch(() => '');
  const order = pickCvFormatOrder(accept);
  let lastErr = null;
  for (const fmt of order) {
    const p = pathForFormat(assets, fmt);
    if (!p) continue;
    try {
      await input.uploadFile(p);
      onProgress?.(`Resume/CV uploaded (${fmt.toUpperCase()})`);
      return { ok: true, path: p, format: fmt };
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('No DOCX or PDF path available for upload');
}
