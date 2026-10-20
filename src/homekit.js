import discoveryModule from 'hap-controller/lib/transport/ip/ip-discovery.js';
import { fork } from 'node:child_process';
import { discoverDirect } from './direct-discovery.js';
const IPDiscovery = discoveryModule.default;

export function discoverDevices(durationMs = 8000) {
  return new Promise((resolve, reject) => {
    const discovery = new IPDiscovery();
    const devices = new Map();
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      discovery.stop();
      if (error) reject(error);
      else resolve([...devices.values()]);
    };
    const record = (service) => devices.set(service.id, {
      id: service.id, name: service.name, model: service.md,
      address: service.address, addresses: service.allAddresses,
      port: service.port, availableToPair: service.availableToPair,
      pairMethod: service.ff & 1 ? 1 : 0,
    });
    discovery.on('serviceUp', record);
    discovery.on('serviceChanged', record);
    discovery.on('error', finish);
    timer = setTimeout(() => finish(), durationMs);
    try { discovery.start(); } catch (error) { finish(error); }
  });
}

export async function discoverStation(config) {
  if (config.stationHost) {
    const direct = await discoverDirect(config.stationHost);
    if (direct.length) return direct;
  }
  return discoverDevices();
}

export function selectDevice(devices, config, expectedId) {
  const matches = devices.filter((device) =>
    (!config.stationHost || device.address === config.stationHost || device.addresses?.includes(config.stationHost)) &&
    (!expectedId || device.id === expectedId));
  if (matches.length !== 1) throw new Error(matches.length ? 'Multiple HomeKit devices found; set NETATMO_HOST' : 'Station not discovered; check LAN, mDNS and NETATMO_HOST');
  const device = matches[0];
  return { ...device, address: config.stationHost || device.address };
}

// Each HAP operation runs in a disposable process. Terminating it bounds stalled
// sockets as well as the HTTP response; no orphaned request survives a timeout.
export function runHomeKitTask(task, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = fork(new URL('./homekit-worker.js', import.meta.url), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { PATH: process.env.PATH, NODE_ENV: 'production' },
      execArgv: [],
    });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('HomeKit operation timed out')), timeoutMs);
    child.on('error', (error) => finish(error));
    child.on('exit', () => finish(new Error('HomeKit worker exited before completing')));
    child.on('message', (message) => message.ok
      ? finish(null, message.value)
      : finish(new Error(message.error)));
    child.send(task, (error) => { if (error) finish(error); });
  });
}
