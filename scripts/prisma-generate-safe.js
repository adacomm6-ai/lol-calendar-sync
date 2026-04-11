const { spawnSync } = require('child_process');

const maxAttempts = 3;
const retryDelayMs = 2000;

function sleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // tiny CLI helper
  }
}

function runGenerate() {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/c', 'npx', 'prisma', 'generate'], {
      stdio: 'inherit',
      env: process.env,
    });
  }

  return spawnSync('npx', ['prisma', 'generate'], {
    stdio: 'inherit',
    env: process.env,
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  console.log(`[prisma:generate:safe] attempt ${attempt}/${maxAttempts}`);

  const result = runGenerate();
  if (result.status === 0) {
    process.exit(0);
  }

  if (result.error) {
    console.error('[prisma:generate:safe] spawn error:', result.error.message || result.error);
  }

  if (attempt < maxAttempts) {
    console.log(`[prisma:generate:safe] failed (exit=${result.status ?? 'null'}), retrying in ${retryDelayMs}ms...`);
    sleep(retryDelayMs);
  }
}

console.error('[prisma:generate:safe] failed after retries.');
process.exit(1);
