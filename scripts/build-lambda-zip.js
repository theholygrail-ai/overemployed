import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const BUILD_DIR = path.join(ROOT, '.lambda-build');
const ZIP_NAME = 'lambda-deploy.zip';
const ZIP_PATH = path.join(ROOT, ZIP_NAME);

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function cpSync(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

console.log('--- Cleaning build dir ---');
if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });

console.log('--- Copying server code ---');
cpSync(path.join(ROOT, 'server'), path.join(BUILD_DIR, 'server'));
cpSync(path.join(ROOT, 'context'), path.join(BUILD_DIR, 'context'));
if (fs.existsSync(path.join(ROOT, 'scripts'))) {
  cpSync(path.join(ROOT, 'scripts'), path.join(BUILD_DIR, 'scripts'));
}

const extZip = path.join(ROOT, 'extension', 'session-helper.zip');
if (fs.existsSync(extZip)) {
  fs.mkdirSync(path.join(BUILD_DIR, 'extension'), { recursive: true });
  fs.copyFileSync(extZip, path.join(BUILD_DIR, 'extension', 'session-helper.zip'));
  console.log('--- Copied extension/session-helper.zip (session helper download) ---');
} else {
  console.log('--- (optional) Run npm run package:extension to embed extension zip ---');
}

console.log('--- Creating slim package.json ---');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const slimDeps = { ...pkg.dependencies };
delete slimDeps['linkedin-jobs-scraper'];
delete slimDeps['concurrently'];
delete slimDeps['react'];
delete slimDeps['react-dom'];
delete slimDeps['react-native-web'];
delete slimDeps['react-router-dom'];
delete slimDeps['puppeteer'];

const slimPkg = {
  name: pkg.name,
  version: pkg.version,
  type: 'module',
  dependencies: slimDeps,
};
fs.writeFileSync(path.join(BUILD_DIR, 'package.json'), JSON.stringify(slimPkg, null, 2));

console.log('--- npm install (production, no scripts) ---');
run('npm install --omit=dev --ignore-scripts', { cwd: BUILD_DIR });

const nmSize = execSync(`powershell -c "(Get-ChildItem -Recurse '${BUILD_DIR}\\node_modules' | Measure-Object -Sum Length).Sum / 1MB"`, { encoding: 'utf8' }).trim();
console.log(`node_modules size: ${parseFloat(nmSize).toFixed(1)} MB`);

console.log('--- Removing unnecessary files from node_modules ---');
const removePatterns = [
  'node_modules/**/test',
  'node_modules/**/tests',
  'node_modules/**/.github',
  'node_modules/**/docs',
  'node_modules/**/example',
  'node_modules/**/examples',
  'node_modules/**/*.md',
  'node_modules/**/*.ts',
  'node_modules/**/*.map',
  'node_modules/**/LICENSE*',
  'node_modules/**/CHANGELOG*',
];
for (const pattern of removePatterns) {
  try {
    const full = path.join(BUILD_DIR, pattern);
    const base = path.dirname(full);
    const name = path.basename(full);
    const items = fs.readdirSync(base, { withFileTypes: true }).filter(d => {
      if (name.includes('*')) {
        const ext = name.replace('*', '');
        return d.name.endsWith(ext) || d.name === name;
      }
      return d.name === name;
    });
    for (const item of items) {
      const p = path.join(base, item.name);
      fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
}

const nmSizeAfter = execSync(`powershell -c "(Get-ChildItem -Recurse '${BUILD_DIR}\\node_modules' | Measure-Object -Sum Length).Sum / 1MB"`, { encoding: 'utf8' }).trim();
console.log(`node_modules after cleanup: ${parseFloat(nmSizeAfter).toFixed(1)} MB`);

console.log('--- Creating zip (archiver) ---');
if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);

const archiver = (await import('archiver')).default;
await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(ZIP_PATH);
  const archive = archiver('zip', { zlib: { level: 6 } });
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  archive.directory(BUILD_DIR, false);
  archive.finalize();
});

const zipSize = fs.statSync(ZIP_PATH).size / (1024 * 1024);
console.log(`Zip size: ${zipSize.toFixed(1)} MB`);

if (zipSize > 50) {
  console.log('Zip > 50MB — must upload via S3.');
} else {
  console.log('Zip <= 50MB — can deploy directly.');
}

console.log('Done. Output:', ZIP_PATH);
