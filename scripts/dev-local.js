const path = require('path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

dotenv.config({ path: path.join(projectRoot, '.env.local'), override: false, quiet: true });
dotenv.config({ path: path.join(projectRoot, '.env'), override: false, quiet: true });

const workspaceRootDbPath = path.resolve(projectRoot, '..', '..', 'prisma', 'dev.db');
const preferredDbPath = projectRoot.includes('__recovery_work__') ? workspaceRootDbPath : path.join(projectRoot, 'prisma', 'dev.db');
const absoluteDbPath = preferredDbPath.replace(/\\/g, '/');
process.env.APP_DB_TARGET = 'local';
process.env.DATABASE_URL = `file:${absoluteDbPath}`;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || '127.0.0.1';

console.log('[dev-local] APP_DB_TARGET=local');
console.log(`[dev-local] DATABASE_URL=${process.env.DATABASE_URL}`);
console.log(`[dev-local] CWD=${process.cwd()}`);
console.log(`[dev-local] Starting Next dev server on http://${hostname}:${port}`);
console.log('[dev-local] Skip auto Prisma prepare on startup. Run "npm run prepare:local" manually when schema/local DB changes.');

async function main() {
  const { startServer } = require('next/dist/server/lib/start-server');
  await startServer({
    dir: process.cwd(),
    port,
    allowRetry: true,
    isDev: true,
    hostname,
  });
}

main().catch((error) => {
  console.error('[dev-local] Failed to start:', error?.message || error);
  process.exit(1);
});
