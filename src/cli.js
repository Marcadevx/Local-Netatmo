import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { configFromEnv } from './config.js';
import { discoverStation, selectDevice, runHomeKitTask } from './homekit.js';
import { loadPairing } from './storage.js';
import { NetatmoAdapter } from './adapter.js';

async function promptPin() {
  if (!stdin.isTTY) throw new Error('Run pairing in an interactive terminal');
  let muted = false;
  const output = new Writable({ write(chunk, encoding, callback) {
    if (!muted) stdout.write(chunk, encoding);
    callback();
  } });
  const prompt = createInterface({ input: stdin, output, terminal: true });
  stdout.write('HomeKit setup code (XXX-XX-XXX, hidden): ');
  muted = true;
  try { return (await prompt.question('')).trim(); }
  finally { prompt.close(); stdout.write('\n'); }
}
async function main() {
  const config = configFromEnv();
  const command = process.argv[2];
  if (command === 'discover') {
    const devices = await discoverStation(config);
    console.log(JSON.stringify(devices.filter((device) => !config.stationHost ||
      device.address === config.stationHost || device.addresses.includes(config.stationHost)), null, 2));
    return;
  }
  if (command !== 'pair') throw new Error('Usage: npm run discover | npm run pair');
  if (await loadPairing(config.pairingFile)) throw new Error('Pairing file already exists. Back it up; do not overwrite working credentials.');
  let device;
  if (config.deviceId) {
    device = { id: config.deviceId, address: config.stationHost, port: config.stationPort, pairMethod: 0 };
    if (!device.address) throw new Error('Manual pairing requires NETATMO_HOST');
  } else {
    device = selectDevice(await discoverStation(config), config);
    if (!device.availableToPair) throw new Error('Station is already paired. Initial setup cannot add another controller with only a setup code. See README.');
  }
  const pin = await promptPin();
  if (!/^\d{3}-\d{2}-\d{3}$/.test(pin)) throw new Error('Expected a HomeKit code formatted XXX-XX-XXX');
  await runHomeKitTask({ operation: 'pair', device, pin, pairingFile: config.pairingFile }, 90000);
  console.log('Pairing credentials saved privately. Verifying a sensor read…');
  try {
    const data = await new NetatmoAdapter(config).read();
    console.log(`Verified ${data.accessories.length} accessories with supported readings.`);
  } catch {
    throw new Error('Pairing was saved, but verification read failed. Keep the pairing file and retry npm start.');
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
