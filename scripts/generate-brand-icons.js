const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = process.cwd();
const svgPath = path.join(root, 'public', 'brand', 'brand-mark.svg');

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function writePng(targetPath, size) {
  const svg = await fs.promises.readFile(svgPath);
  await sharp(svg, { density: 512 })
    .resize(size, size)
    .png()
    .toFile(targetPath);
}

async function main() {
  const brandDir = path.join(root, 'public', 'brand');
  const iconsDir = path.join(root, 'public', 'icons');

  await ensureDir(brandDir);
  await ensureDir(iconsDir);

  await writePng(path.join(brandDir, 'favicon-32x32.png'), 32);
  await writePng(path.join(brandDir, 'apple-touch-icon.png'), 180);
  await writePng(path.join(iconsDir, 'icon-192x192.png'), 192);
  await writePng(path.join(iconsDir, 'icon-512x512.png'), 512);

  console.log(JSON.stringify({
    svgPath,
    generated: [
      'public/brand/favicon-32x32.png',
      'public/brand/apple-touch-icon.png',
      'public/icons/icon-192x192.png',
      'public/icons/icon-512x512.png',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
