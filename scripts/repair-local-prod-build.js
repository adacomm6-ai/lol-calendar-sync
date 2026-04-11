const fs = require('fs');
const path = require('path');

const root = process.cwd();
const nextDir = path.join(root, '.next');
const staticDir = path.join(nextDir, 'static');
const devDir = path.join(nextDir, 'dev');

function exists(file) {
  return fs.existsSync(file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonNoBom(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), { encoding: 'utf8' });
}

function createRoutesManifest(routesFile) {
  const routesManifest = exists(routesFile) ? readJson(routesFile) : {};
  const normalizedRoutes = {
    version: typeof routesManifest.version === 'number' ? routesManifest.version : 3,
    pages404: routesManifest.pages404 !== false,
    caseSensitive: Boolean(routesManifest.caseSensitive),
    basePath: routesManifest.basePath || '',
    redirects: Array.isArray(routesManifest.redirects) ? routesManifest.redirects : [],
    headers: Array.isArray(routesManifest.headers) ? routesManifest.headers : [],
    dynamicRoutes: Array.isArray(routesManifest.dynamicRoutes) ? routesManifest.dynamicRoutes : [],
    staticRoutes: Array.isArray(routesManifest.staticRoutes) ? routesManifest.staticRoutes : [],
    dataRoutes: Array.isArray(routesManifest.dataRoutes) ? routesManifest.dataRoutes : [],
    i18n: routesManifest.i18n ?? null,
    rewrites: {
      beforeFiles: Array.isArray(routesManifest.rewrites?.beforeFiles) ? routesManifest.rewrites.beforeFiles : [],
      afterFiles: Array.isArray(routesManifest.rewrites?.afterFiles) ? routesManifest.rewrites.afterFiles : [],
      fallback: Array.isArray(routesManifest.rewrites?.fallback) ? routesManifest.rewrites.fallback : [],
    },
  };
  writeJsonNoBom(routesFile, normalizedRoutes);
}

function createAppPathRoutesManifest() {
  const appPathsSource = path.join(nextDir, 'server', 'app-paths-manifest.json');
  if (!exists(appPathsSource)) return;

  const source = readJson(appPathsSource);
  const appPathRoutes = {};
  for (const key of Object.keys(source)) {
    let route = key;
    if (route.endsWith('/page')) route = route.slice(0, -5) || '/';
    if (route.endsWith('/route')) route = route.slice(0, -6) || '/';
    if (!route) route = '/';
    appPathRoutes[route] = key;
  }

  writeJsonNoBom(path.join(nextDir, 'app-path-routes-manifest.json'), appPathRoutes);
}

function createRequiredServerFilesManifest() {
  const requiredServerFiles = {
    version: 1,
    config: {
      distDir: '.next',
      basePath: '',
      trailingSlash: false,
      images: {
        remotePatterns: [
          { protocol: 'https', hostname: 'ddragon.leagueoflegends.com' },
          { protocol: 'https', hostname: 'am-a.akamaihd.net' },
          { protocol: 'https', hostname: 'static.wikia.nocookie.net' },
          { protocol: 'https', hostname: 'bbibilxlkjcrscyvzzgq.supabase.co' },
        ],
        localPatterns: [{ pathname: '/**' }],
        minimumCacheTTL: 2678400,
        deviceSizes: [640, 750, 828, 1080, 1200, 1920],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
      },
      experimental: {
        serverActions: {
          bodySizeLimit: '10mb',
          allowedOrigins: ['localhost:3000', '0.0.0.0:3000', '100.77.151.127:3000', '127.0.0.1:3000'],
        },
        isExperimentalCompile: false,
      },
    },
    appDir: root,
    relativeAppDir: '.',
    files: [
      '.next/routes-manifest.json',
      '.next/server/pages-manifest.json',
      '.next/build-manifest.json',
      '.next/prerender-manifest.json',
      '.next/server/middleware-manifest.json',
      '.next/server/middleware-build-manifest.js',
      '.next/server/app-paths-manifest.json',
      '.next/app-path-routes-manifest.json',
      '.next/server/server-reference-manifest.js',
      '.next/server/server-reference-manifest.json',
      '.next/BUILD_ID',
      '.next/server/next-font-manifest.js',
      '.next/server/next-font-manifest.json',
      '.next/required-server-files.json',
    ],
    ignore: [],
  };

  writeJsonNoBom(path.join(nextDir, 'required-server-files.json'), requiredServerFiles);
}

function main() {
  if (!exists(nextDir) || !exists(staticDir)) {
    console.error('[repair-local-prod-build] Missing .next/static, cannot repair.');
    process.exit(1);
  }

  const buildCandidates = fs
    .readdirSync(staticDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== 'chunks' && name !== 'media');

  const buildId = buildCandidates[0];
  if (!buildId) {
    console.error('[repair-local-prod-build] Missing hashed static build directory.');
    process.exit(1);
  }

  fs.writeFileSync(path.join(nextDir, 'BUILD_ID'), buildId, { encoding: 'ascii' });

  const prerenderSrc = path.join(devDir, 'prerender-manifest.json');
  const loadableSrc = path.join(devDir, 'react-loadable-manifest.json');
  const prerenderDst = path.join(nextDir, 'prerender-manifest.json');
  const loadableDst = path.join(nextDir, 'react-loadable-manifest.json');

  if (!exists(prerenderDst) && exists(prerenderSrc)) {
    fs.copyFileSync(prerenderSrc, prerenderDst);
  }
  if (!exists(loadableDst) && exists(loadableSrc)) {
    fs.copyFileSync(loadableSrc, loadableDst);
  }

  createRoutesManifest(path.join(nextDir, 'routes-manifest.json'));
  createAppPathRoutesManifest();
  createRequiredServerFilesManifest();

  console.log('[repair-local-prod-build] BUILD_ID=' + buildId);
  console.log('[repair-local-prod-build] Production manifests repaired.');
}

main();
