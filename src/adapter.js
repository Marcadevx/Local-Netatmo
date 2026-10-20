import { loadPairing } from './storage.js';
import { normalizeAccessories } from './readings.js';
import { runHomeKitTask } from './homekit.js';
export class AdapterError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
export class NetatmoAdapter {
  constructor(config, { readTask = runHomeKitTask, readPairing = loadPairing, now = Date.now } = {}) {
    this.config = config;
    this.readTask = readTask;
    this.readPairing = readPairing;
    this.now = now;
    this.cache = null;
    this.inflight = null;
  }
  async paired() { return Boolean(await this.readPairing(this.config.pairingFile)); }
  async read() {
    if (this.cache && this.now() - this.cache.time < this.config.cacheTtlMs) return this.cache.value;
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchReadings().finally(() => { this.inflight = null; });
    return this.inflight;
  }
  async fetchReadings() {
    const saved = await this.readPairing(this.config.pairingFile);
    if (!saved) throw new AdapterError('not_paired', 'Run npm run discover, then npm run pair on the station LAN', 503);
    if (this.config.deviceId && this.config.deviceId !== saved.device.id) {
      throw new AdapterError('device_mismatch', 'Configured device differs from saved pairing', 503);
    }
    const device = {
      ...saved.device,
      address: this.config.stationHost || saved.device.address,
      port: this.config.stationPort || saved.device.port,
    };
    try {
      const database = await this.readTask({ operation: 'read', device, pairingData: saved.pairingData });
      const value = {
        readAt: new Date(this.now()).toISOString(),
        source: 'homekit',
        accessories: normalizeAccessories(database),
      };
      this.cache = { value, time: this.now() };
      return value;
    } catch {
      throw new AdapterError('station_unavailable', 'Could not read the station over HomeKit; check connectivity and pairing', 502);
    }
  }
}
