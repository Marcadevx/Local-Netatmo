import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetatmoAdapter } from '../src/adapter.js';
import { createApp } from '../src/app.js';
import { normalizeAccessories } from '../src/readings.js';
import { configFromEnv } from '../src/config.js';
import { selectDevice, runHomeKitTask } from '../src/homekit.js';
import { loadPairing, savePairing } from '../src/storage.js';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const characteristic = (type, iid, value, extra = {}) => ({ type, iid, value, perms: ['pr'], ...extra });
const database = { accessories: [{ aid: 1, services: [
  { type: '3E', iid: 1, characteristics: [characteristic('23', 2, 'Indoor')] },
  { type: '8A', iid: 10, characteristics: [
    characteristic('00000011-0000-1000-8000-0026BB765291', 11, 0),
    characteristic('10', 12, 55), characteristic('93', 13, 800),
    characteristic('90', 14, 2), characteristic('79', 15, 0),
    characteristic('68', 16, 10, { status: -70402 }), characteristic('99', 17, 123),
  ] },
] }] };
const config = configFromEnv({});
const pairing = { version: 1, device: { id: 'test', address: '192.0.2.1', port: 123 }, pairingData: { secret: 'private-key' } };

test('maps actual UUIDs and units, preserving zero and per-characteristic errors', () => {
  const [module] = normalizeAccessories(database);
  assert.equal(module.name, 'Indoor');
  assert.equal(module.readings.length, 6);
  assert.equal(module.readings[0].value, 0);
  assert.equal(module.readings[0].unit, '°C');
  assert.equal(module.readings[2].metric, 'carbonDioxide');
  assert.equal(module.readings[2].unit, 'ppm');
  assert.equal(module.readings[5].value, null);
  assert.equal(module.readings[5].status, -70402);
});
test('coalesces concurrent reads, expires cache, and never silently serves expired data', async () => {
  let now = 0, calls = 0, fail = false;
  const adapter = new NetatmoAdapter(config, {
    now: () => now, readPairing: async () => pairing,
    readTask: async () => { calls++; await new Promise((r) => setTimeout(r, 5)); if (fail) throw new Error('private-key'); return database; },
  });
  const [a, b] = await Promise.all([adapter.read(), adapter.read()]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await adapter.read(); assert.equal(calls, 1);
  now = 31000; fail = true;
  await assert.rejects(adapter.read(), { code: 'station_unavailable' });
  fail = false;
  await adapter.read(); assert.equal(calls, 3);
});
test('HTTP reports missing pairing, separates liveness/readiness, and enforces auth', async () => {
  const adapter = new NetatmoAdapter(config, { readPairing: async () => null });
  const app = createApp(adapter, { ...config, token: 'test-token' });
  assert.equal((await app.request('/health')).status, 401);
  const request = (path) => app.request(path, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal((await request('/health')).status, 200);
  assert.equal((await request('/ready')).status, 503);
  const response = await request('/api/readings');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).error, 'not_paired');
  assert.deepEqual(await (await request('/api/status')).json(), { paired: false });
});
test('upstream failure exposes no credentials', async () => {
  const adapter = new NetatmoAdapter(config, { readPairing: async () => pairing, readTask: async () => { throw new Error('private-key'); } });
  const response = await createApp(adapter, config).request('/api/readings');
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private-key/);
});
test('successful HTTP response has sensor data and no pairing material', async () => {
  const adapter = new NetatmoAdapter(config, { readPairing: async () => pairing, readTask: async () => database });
  const response = await createApp(adapter, config).request('/api/readings');
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /temperature/); assert.doesNotMatch(body, /private-key/);
});
test('validates network binding and discovery selection', () => {
  assert.throws(() => configFromEnv({ HOST: '0.0.0.0' }), /API_TOKEN/);
  assert.throws(() => configFromEnv({ NETATMO_PORT: '123' }), /both/);
  assert.throws(() => configFromEnv({ PORT: 'x' }), /PORT/);
  const device = { id: 'a', address: '::1', addresses: ['::1', '192.0.2.1'] };
  assert.equal(selectDevice([device], { stationHost: '192.0.2.1' }).address, '192.0.2.1');
  assert.throws(() => selectDevice([device], {}, 'wrong'), /not discovered/);
});
test('pairing storage is atomic, private, and round trips', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'local-netatmo-test-'));
  try {
    const file = join(directory, 'data/pairing.json');
    assert.equal(await loadPairing(file), null);
    await savePairing(file, pairing.device, pairing.pairingData);
    assert.deepEqual(await loadPairing(file), pairing);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally { await rm(directory, { recursive: true }); }
});
test('HomeKit process timeout bounds a stalled operation', async () => {
  await assert.rejects(runHomeKitTask({ operation: 'read', device: pairing.device }, 1), /timed out/);
});
