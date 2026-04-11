const { spawnSync } = require('child_process');

function isFileDatabaseUrl(value) {
  return String(value || '').trim().toLowerCase().startsWith('file:');
}

function resolveMode() {
  const rawDatabaseUrl = String(process.env.DATABASE_URL || '').trim();
  const appDbTarget = String(process.env.APP_DB_TARGET || '').trim().toLowerCase();

  if (appDbTarget === 'cloud') return 'cloud';
  if (appDbTarget === 'local') return 'local';
  if (rawDatabaseUrl && !isFileDatabaseUrl(rawDatabaseUrl)) return 'cloud';
  return 'local';
}

function runNode(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const generateOnly = process.argv.includes('--generate-only');
  const mode = resolveMode();

  if (mode === 'cloud') {
    console.log('[prepare-prisma] using cloud schema.');
    runNode(['node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/schema.prisma'], {
      APP_DB_TARGET: 'cloud',
    });
    return;
  }

  if (generateOnly) {
    console.log('[prepare-prisma] generate local client only.');
    runNode(['node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/schema.local.prisma'], {
      APP_DB_TARGET: 'local',
      DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
    });
    return;
  }

  console.log('[prepare-prisma] prepare local schema and database if needed.');
  runNode(['scripts/prepare-local-if-needed.js'], {
    APP_DB_TARGET: 'local',
    DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
  });
}

main();
