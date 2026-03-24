import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const BUILD_DIR = path.join(ROOT, '.lambda-build');
const ZIP_PATH = path.join(ROOT, 'lambda-deploy.zip');

if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);

console.log(`Creating zip from: ${BUILD_DIR}`);

const output = fs.createWriteStream(ZIP_PATH);
const archive = archiver('zip', { zlib: { level: 5 } });

archive.on('error', (err) => {
  console.error('Archive error:', err);
  process.exit(1);
});

archive.on('warning', (err) => {
  console.warn('Archive warning:', err.message);
});

archive.pipe(output);
archive.directory(BUILD_DIR, false);

await new Promise((resolve, reject) => {
  output.on('close', resolve);
  output.on('error', reject);
  archive.finalize();
});

const mb = (fs.statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(1);
console.log(`Zip created: ${mb} MB -> ${ZIP_PATH}`);
