process.env.NODE_ENV = 'development';
process.env.__NEXT_DISABLE_MEMORY_WATCHER = '1';
const { startServer } = require('next/dist/server/lib/start-server');

startServer({
  dir: process.cwd(),
  port: 3000,
  allowRetry: false,
  isDev: true,
  hostname: '127.0.0.1',
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
