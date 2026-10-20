import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function loadPairing(file) {
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved.version !== 1 || !saved.device?.id || !saved.pairingData) throw new Error('Invalid pairing file');
    return saved;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
export async function savePairing(file, device, pairingData) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, device, pairingData }, null, 2), { mode: 0o600, flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}
