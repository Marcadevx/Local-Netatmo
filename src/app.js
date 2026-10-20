import { Hono } from 'hono';
import { timingSafeEqual, createHash } from 'node:crypto';
import { AdapterError } from './adapter.js';
const digest = (value) => createHash('sha256').update(value).digest();
export function createApp(adapter, config) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    if (config.token && !timingSafeEqual(digest(c.req.header('Authorization') || ''), digest(`Bearer ${config.token}`))) {
      c.header('WWW-Authenticate', 'Bearer');
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  });
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/ready', async (c) => {
    const readings = await adapter.read();
    return c.json({ status: 'ready', readAt: readings.readAt });
  });
  app.get('/api/status', async (c) => c.json({ paired: await adapter.paired() }));
  app.get('/api/readings', async (c) => c.json(await adapter.read()));
  app.onError((error, c) => error instanceof AdapterError
    ? c.json({ error: error.code, message: error.message }, error.status)
    : c.json({ error: 'internal_error' }, 500));
  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  return app;
}
