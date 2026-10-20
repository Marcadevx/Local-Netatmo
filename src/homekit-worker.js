import clientModule from 'hap-controller/lib/transport/ip/http-client.js';
import { savePairing } from './storage.js';
const HttpClient = clientModule.default;
process.once('message', async ({ operation, device, pairingData, pin, pairingFile }) => {
  const client = new HttpClient(device.id, device.address, device.port, pairingData);
  try {
    if (operation === 'pair') {
      await client.pairSetup(pin, device.pairMethod ?? 0);
      const keys = client.getLongTermData();
      if (!keys) throw new Error('Pairing returned no credentials');
      // Persist before the verification read: a failed read must not lose keys.
      await savePairing(pairingFile, device, keys);
      process.send({ ok: true, value: { paired: true } });
    } else if (operation === 'read') {
      const database = await client.getAccessories();
      process.send({ ok: true, value: database });
    } else throw new Error('Unknown HomeKit operation');
  } catch {
    // Library errors can contain protocol buffers; never forward them to HTTP/logs.
    process.send({ ok: false, error: operation === 'pair'
      ? 'HomeKit pairing failed. Check code and pairing availability; avoid repeated attempts.'
      : 'HomeKit read failed. Check station connectivity and saved pairing.' });
  } finally {
    await client.closePersistentConnection();
  }
});
