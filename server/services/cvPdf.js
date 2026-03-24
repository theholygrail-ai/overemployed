/**
 * Generate a PDF version of the tailored CV (same source text as DOCX) for ATS that only accept PDF.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { dataRoot } from '../lib/dataPath.js';

const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

const BASE_DIR = path.join(dataRoot(), 'cvs');

function ensureDir() {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
}

/**
 * Light cleanup so PDF isn't full of markdown markers.
 */
export function cvTextToPlainForPdf(cvText) {
  if (!cvText || typeof cvText !== 'string') return '';
  let t = cvText.replace(/\r\n/g, '\n');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/\*([^*]+)\*/g, '$1');
  t = t.replace(/`([^`]+)`/g, '$1');
  return t.trim();
}

export async function generatePdf(cvContent, applicationId) {
  ensureDir();
  const cvText = typeof cvContent === 'string' ? cvContent : cvContent?.cv || '';
  const plain = cvTextToPlainForPdf(cvText);
  const filePath = path.join(BASE_DIR, `${applicationId}.pdf`);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 48,
      size: 'LETTER',
      info: { Title: 'CV', Author: 'Overemployed' },
    });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.font('Helvetica');
    doc.fontSize(10);
    doc.text(plain || '(Empty CV)', {
      width: 500,
      align: 'left',
      lineGap: 2,
    });
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return filePath;
}

export async function getPdfPath(applicationId) {
  const filePath = path.join(BASE_DIR, `${applicationId}.pdf`);
  return fs.existsSync(filePath) ? filePath : null;
}
