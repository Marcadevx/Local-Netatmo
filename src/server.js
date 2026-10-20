import { serve } from '@hono/node-server';
import { configFromEnv } from './config.js';
import { createApp } from './app.js';
import { NetatmoAdapter } from './adapter.js';
const config = configFromEnv();
const app = createApp(new NetatmoAdapter(config), config);
const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
  console.log(`local-netatmo listening on ${config.host}:${config.port}`);
});
server.on('error', () => { console.error('HTTP server failed to listen'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 20000).unref();
});
