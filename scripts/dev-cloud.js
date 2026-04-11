const { spawn, spawnSync } = require('child_process');

function runNodeStep(args, env = process.env) {
  const res = spawnSync('node', args, { stdio: 'inherit', env });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

function startNext(env) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'next';
  const args = process.platform === 'win32' ? ['/c', 'next', 'dev'] : ['dev'];
  const child = spawn(command, args, { stdio: 'inherit', env });
  child.on('exit', (code) => process.exit(code || 0));
}

const env = { ...process.env, APP_DB_TARGET: 'cloud' };

runNodeStep(['node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/schema.prisma'], env);

startNext(env);
