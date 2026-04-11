const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const requiredProdMarkers = [
  path.join(projectRoot, '.next', 'BUILD_ID'),
  path.join(projectRoot, '.next', 'routes-manifest.json'),
];
const legacyBuildMarkers = [
  path.join(projectRoot, '.next', 'build-manifest.json'),
  path.join(projectRoot, '.next', 'package.json'),
];
const fingerprintPath = path.join(projectRoot, '.next', 'local-build-fingerprint.json');
const shouldWriteFingerprint = process.argv.includes('--write');

const watchTargets = [
  path.join(projectRoot, 'src'),
  path.join(projectRoot, 'public'),
  path.join(projectRoot, 'package.json'),
  path.join(projectRoot, 'next.config.ts'),
  path.join(projectRoot, 'tsconfig.json'),
  path.join(projectRoot, '.env'),
  path.join(projectRoot, '.env.local'),
];

const skipNames = new Set(['.next', 'node_modules', 'backups', '.git']);

function collectFiles(targetPath, bucket) {
  try {
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
      bucket.push(targetPath);
      return;
    }
    if (!stat.isDirectory()) return;

    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      if (skipNames.has(entry.name)) continue;
      collectFiles(path.join(targetPath, entry.name), bucket);
    }
  } catch {
    return;
  }
}

function computeFingerprint() {
  const files = [];
  for (const target of watchTargets) {
    collectFiles(target, files);
  }

  files.sort();
  const hash = crypto.createHash('sha1');
  for (const file of files) {
    const relative = path.relative(projectRoot, file).replace(/\\/g, '/');
    hash.update(relative);
    hash.update('\n');
    hash.update(fs.readFileSync(file));
    hash.update('\n');
  }

  return {
    hash: hash.digest('hex'),
    fileCount: files.length,
    updatedAt: new Date().toISOString(),
  };
}

function readStoredFingerprint() {
  try {
    return JSON.parse(fs.readFileSync(fingerprintPath, 'utf8'));
  } catch {
    return null;
  }
}

const hasRequiredProdMarkers = requiredProdMarkers.every((target) => fs.existsSync(target));
const hasLegacyBuildMarkers = legacyBuildMarkers.some((target) => fs.existsSync(target));
if (!hasRequiredProdMarkers || !hasLegacyBuildMarkers) {
  console.log('BUILD_REQUIRED:missing_build');
  process.exit(2);
}

const currentFingerprint = computeFingerprint();

if (shouldWriteFingerprint) {
  fs.mkdirSync(path.dirname(fingerprintPath), { recursive: true });
  fs.writeFileSync(fingerprintPath, JSON.stringify(currentFingerprint, null, 2), 'utf8');
  console.log(`BUILD_FINGERPRINT_WRITTEN:${currentFingerprint.hash}`);
  process.exit(0);
}

const storedFingerprint = readStoredFingerprint();
if (!storedFingerprint || storedFingerprint.hash !== currentFingerprint.hash) {
  console.log('BUILD_REQUIRED:source_changed');
  process.exit(2);
}

console.log('BUILD_NOT_REQUIRED');
