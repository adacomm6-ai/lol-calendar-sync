const { spawnSync } = require('child_process');

function runNodeScript(file, extraArgs = []) {
  return spawnSync(process.execPath, [file, ...extraArgs], {
    stdio: 'inherit',
    env: process.env,
  });
}

const passthroughArgs = process.argv.slice(2);

console.log('--- Cloud Schema Sync Wrapper ---');
console.log('Step 1: direct schema push');
let first = runNodeScript('scripts/push_schema.js', passthroughArgs);
if (first.status === 0) {
  process.exit(0);
}

console.log('\nFirst push failed. Running cloud maintenance and retrying once...');
const maintenance = runNodeScript('scripts/cloud-preflight-maintenance.js');
if (maintenance.status !== 0) {
  console.error('Maintenance step failed; aborting retry.');
  process.exit(first.status || 1);
}

console.log('\nStep 2: retry schema push after maintenance');
const second = runNodeScript('scripts/push_schema.js', passthroughArgs);
process.exit(second.status || 1);
