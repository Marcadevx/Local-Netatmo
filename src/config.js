import { resolve } from 'node:path';
import { isIP } from 'node:net';

function integer(value, fallback, min, max, name) {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`Invalid ${name}`);
  return result;
}
export function configFromEnv(env = process.env) {
  const host = env.HOST || '127.0.0.1';
  const token = env.API_TOKEN || '';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && token.length < 32) {
    throw new Error('Set API_TOKEN to at least 32 characters before listening beyond loopback');
  }
  if (env.NETATMO_HOST && !isIP(env.NETATMO_HOST)) throw new Error('NETATMO_HOST must be an IP address');
  if (Boolean(env.NETATMO_DEVICE_ID) !== Boolean(env.NETATMO_PORT)) throw new Error('Set both NETATMO_DEVICE_ID and NETATMO_PORT');
  return {
    host, token,
    port: integer(env.PORT, 3000, 1, 65535, 'PORT'),
    stationHost: env.NETATMO_HOST || undefined,
    deviceId: env.NETATMO_DEVICE_ID || undefined,
    stationPort: env.NETATMO_PORT ? integer(env.NETATMO_PORT, 0, 1, 65535, 'NETATMO_PORT') : undefined,
    pairingFile: resolve(env.PAIRING_FILE || './data/pairing.json'),
    cacheTtlMs: integer(env.CACHE_TTL_SECONDS, 30, 0, 3600, 'CACHE_TTL_SECONDS') * 1000,
  };
}
