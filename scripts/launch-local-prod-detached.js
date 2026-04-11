const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const host = process.env.HOSTNAME || '127.0.0.1';
const port = String(process.env.PORT || '3000');

const logDir = path.join(projectRoot, 'logs');
const outPath = path.join(logDir, 'prod-local.log');
const errPath = path.join(logDir, 'prod-local.err.log');
const pidPath = path.join(projectRoot, '.local-prod.pid');

fs.mkdirSync(logDir, { recursive: true });

const outFd = fs.openSync(outPath, 'a');
const errFd = fs.openSync(errPath, 'a');

const child = spawn(
  'npm.cmd',
  ['run', 'prod:local'],
  {
    cwd: projectRoot,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', outFd, errFd],
    env: {
      ...process.env,
      APP_DB_TARGET: 'local',
      DATABASE_URL: 'file:./prisma/dev.db',
      HOSTNAME: host,
      PORT: port,
      NODE_ENV: 'production',
    },
  },
);

child.unref();

try {
  fs.writeFileSync(pidPath, String(child.pid), 'ascii');
} catch {}
