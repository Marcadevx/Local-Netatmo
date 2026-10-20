import { createSocket } from 'node:dgram';
import { isIPv4 } from 'node:net';
import { randomInt } from 'node:crypto';
import dnsPacket from 'dns-packet';

const canonical = (name) => name.toLowerCase().replace(/\.$/, '');

export function parseHomeKitAdvertisement(packet, address) {
  const records = [...(packet.answers || []), ...(packet.additionals || [])];
  const devices = [];
  for (const pointer of records.filter((record) => record.type === 'PTR' && canonical(record.name) === '_hap._tcp.local' && record.ttl > 0)) {
    const instance = canonical(pointer.data);
    const srv = records.find((record) => record.type === 'SRV' && canonical(record.name) === instance && record.ttl > 0);
    const txt = records.find((record) => record.type === 'TXT' && canonical(record.name) === instance && record.ttl > 0);
    if (!srv || !txt || !Array.isArray(txt.data)) continue;
    const fields = Object.fromEntries(txt.data.map((buffer) => {
      const value = buffer.toString('utf8');
      const index = value.indexOf('=');
      return index < 0 ? [value, ''] : [value.slice(0, index), value.slice(index + 1)];
    }));
    const status = Number(fields.sf);
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(fields.id || '') ||
        !Number.isInteger(srv.data.port) || srv.data.port < 1 || srv.data.port > 65535 ||
        !Number.isInteger(status) || !fields.sf) continue;
    devices.push({
      id: fields.id, name: pointer.data.replace(/\._hap\._tcp\.local\.?$/i, ''),
      model: fields.md, address, addresses: [address], port: srv.data.port,
      availableToPair: Boolean(status & 1), pairMethod: Number(fields.ff || 0) & 1 ? 1 : 0,
    });
  }
  return devices;
}

// Query the known station from an ephemeral UDP port, requesting a unicast
// response. This works on LANs where multicast browsing doesn't reach us.
export function discoverDirect(address, timeoutMs = 3000, port = 5353) {
  if (!isIPv4(address || '')) return Promise.resolve([]);
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    const id = randomInt(1, 65536);
    let done = false;
    const finish = (devices = []) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close();
      resolve(devices);
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    socket.on('error', () => finish());
    socket.on('message', (message, peer) => {
      if (peer.address !== address || peer.port !== port) return;
      try {
        const response = dnsPacket.decode(message);
        if (response.type !== 'response' || response.id !== id) return;
        const devices = parseHomeKitAdvertisement(response, address);
        if (devices.length) finish(devices);
      } catch { /* Ignore malformed or unrelated UDP packets until timeout. */ }
    });
    const query = dnsPacket.encode({ type: 'query', id, questions: [{ type: 'PTR', name: '_hap._tcp.local' }] });
    socket.send(query, port, address, (error) => { if (error) finish(); });
  });
}
