import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  TabStopPosition,
  TabStopType,
  convertInchesToTwip,
} from 'docx';
import fs from 'fs';
import path from 'path';
import { dataRoot } from '../lib/dataPath.js';

const BASE_DIR = path.join(dataRoot(), 'cvs');

function ensureDir() {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
}

function isAllCaps(line) {
  const stripped = line.trim();
  return stripped.length > 1 && stripped === stripped.toUpperCase() && /[A-Z]/.test(stripped);
}

function isBullet(line) {
  return /^\s*[•\-*]\s/.test(line);
}

function isCompanyLine(line) {
  return line.includes('—') || line.includes('--');
}

function isRoleLine(line) {
  return line.includes('|') && !line.includes('@');
}

function parseCvText(cvText) {
  const sections = cvText.split(/\n\s*\n/);
  const paragraphs = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    const lines = section.split('\n').map(l => l.trimEnd());

    if (i === 0) {
      const nameLine = lines[0]?.trim();
      if (nameLine) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: nameLine,
                bold: true,
                size: 28,
                font: 'Calibri',
              }),
            ],
          })
        );
      }

      if (lines[1]) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: lines[1].trim(),
                size: 10 * 2,
                font: 'Calibri',
              }),
            ],
          })
        );
      }

      for (let j = 2; j < lines.length; j++) {
        if (lines[j].trim()) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: lines[j].trim(),
                  size: 10 * 2,
                  font: 'Calibri',
                }),
              ],
            })
          );
        }
      }
      continue;
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (isAllCaps(trimmed) && !isBullet(trimmed)) {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 240, after: 120 },
            border: {
              bottom: {
                color: '000000',
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
              },
            },
            children: [
              new TextRun({
                text: trimmed,
                bold: true,
                size: 12 * 2,
                font: 'Calibri',
                allCaps: true,
              }),
            ],
          })
        );
      } else if (isBullet(trimmed)) {
        const bulletText = trimmed.replace(/^\s*[•\-*]\s*/, '');
        paragraphs.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: convertInchesToTwip(0.5) },
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: bulletText,
                size: 10.5 * 2,
                font: 'Calibri',
              }),
            ],
          })
        );
      } else if (isCompanyLine(trimmed)) {
        const separator = trimmed.includes('—') ? '—' : '--';
        const parts = trimmed.split(separator).map(p => p.trim());
        paragraphs.push(
          new Paragraph({
            spacing: { before: 120, after: 40 },
            children: [
              new TextRun({
                text: parts[0],
                bold: true,
                size: 11 * 2,
                font: 'Calibri',
              }),
              new TextRun({
                text: parts[1] ? ` — ${parts[1]}` : '',
                bold: true,
                size: 11 * 2,
                font: 'Calibri',
              }),
            ],
          })
        );
      } else if (isRoleLine(trimmed)) {
        const parts = trimmed.split('|').map(p => p.trim());
        const role = parts[0] || '';
        const date = parts.slice(1).join(' | ').trim();

        paragraphs.push(
          new Paragraph({
            spacing: { after: 40 },
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: TabStopPosition.MAX,
              },
            ],
            children: [
              new TextRun({
                text: role,
                size: 11 * 2,
                font: 'Calibri',
              }),
              new TextRun({
                text: `\t${date}`,
                italics: true,
                size: 11 * 2,
                font: 'Calibri',
              }),
            ],
          })
        );
      } else {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: trimmed,
                size: 11 * 2,
                font: 'Calibri',
              }),
            ],
          })
        );
      }
    }
  }

  return paragraphs;
}

export async function generateDocx(cvContent, applicationId) {
  ensureDir();

  const cvText = typeof cvContent === 'string' ? cvContent : cvContent.cv;
  const paragraphs = parseCvText(cvText);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.7),
              bottom: convertInchesToTwip(0.7),
              left: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filePath = path.join(BASE_DIR, `${applicationId}.docx`);
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

export async function getDocxPath(applicationId) {
  const filePath = path.join(BASE_DIR, `${applicationId}.docx`);
  return fs.existsSync(filePath) ? filePath : null;
}

export async function listGeneratedCVs() {
  ensureDir();
  const files = fs.readdirSync(BASE_DIR).filter(f => f.endsWith('.docx'));

  return files.map(file => {
    const filePath = path.join(BASE_DIR, file);
    const stats = fs.statSync(filePath);
    return {
      applicationId: path.basename(file, '.docx'),
      path: filePath,
      size: stats.size,
      createdAt: stats.birthtime,
    };
  });
}
