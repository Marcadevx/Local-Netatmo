import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import dnsPacket from 'dns-packet';
import { parseHomeKitAdvertisement, discoverDirect } from '../src/direct-discovery.js';

const name = 'Weather Station._hap._tcp.local';
const advertisement = (sf = '1') => ({ type: 'response', answers: [
  { name: '_hap._tcp.local', type: 'PTR', ttl: 10, data: name },
], additionals: [
  { name, type: 'SRV', ttl: 10, data: { port: 5001, target: 'weather.local' } },
  { name, type: 'TXT', ttl: 10, data: ['id=AA:BB:CC:DD:EE:FF', `sf=${sf}`, 'ff=1', 'md=Weather Station', 'private_field=ignored'].map((value) => Buffer.from(value)) },
] });

test('parses compressed DNS advertisement and pairing flags without exposing unrelated TXT fields', () => {
  const packet = dnsPacket.decode(dnsPacket.encode(advertisement()));
  const [device] = parseHomeKitAdvertisement(packet, '192.0.2.1');
  assert.equal(device.port, 5001);
  assert.equal(device.availableToPair, true);
  assert.equal(device.pairMethod, 1);
  assert.equal(device.name, 'Weather Station');
  assert.equal(device.private_field, undefined);
  assert.equal(parseHomeKitAdvertisement(advertisement('0'), '192.0.2.1')[0].availableToPair, false);
  const broken = advertisement(); broken.additionals = [];
  assert.deepEqual(parseHomeKitAdvertisement(broken, '192.0.2.1'), []);
});

test('direct discovery handles malformed packets and closes its socket on a valid response', async () => {
  const server = createSocket('udp4');
  await new Promise((resolve, reject) => { server.once('error', reject); server.bind(0, '127.0.0.1', resolve); });
  try {
    server.on('message', (message, peer) => {
      const request = dnsPacket.decode(message);
      assert.equal(request.questions[0].name, '_hap._tcp.local');
      server.send(Buffer.from('malformed'), peer.port, peer.address);
      server.send(dnsPacket.encode({ ...advertisement(), id: request.id }), peer.port, peer.address);
    });
    const [device] = await discoverDirect('127.0.0.1', 1000, server.address().port);
    assert.equal(device.id, 'AA:BB:CC:DD:EE:FF');
  } finally { server.close(); }
});

test('direct discovery returns promptly when no response arrives', async () => {
  assert.deepEqual(await discoverDirect('127.0.0.2', 20), []);
  assert.deepEqual(await discoverDirect('::1'), []);
});
