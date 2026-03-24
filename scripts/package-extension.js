/**
 * Zip chrome extension for distribution: extension/session-helper.zip
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'extension', 'session-helper');
const OUT_DIR = path.join(ROOT, 'extension');
const OUT_ZIP = path.join(OUT_DIR, 'session-helper.zip');
const PUBLIC_DIR = path.join(ROOT, 'public', 'extension');

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing', SRC);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(OUT_ZIP);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(SRC, false);
    archive.finalize();
  });

  fs.copyFileSync(OUT_ZIP, path.join(PUBLIC_DIR, 'session-helper.zip'));
  const kb = (fs.statSync(OUT_ZIP).size / 1024).toFixed(1);
  console.log('Wrote', OUT_ZIP, `(${kb} KB)`);
  console.log('Copied to public/extension/session-helper.zip for Vite static hosting');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
