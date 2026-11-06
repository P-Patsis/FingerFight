import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const file = new URL('../.android-tools/hand_landmarker.task', import.meta.url);
let bytes;
try { bytes = await readFile(file); } catch (err) {
  if (err.code !== 'ENOENT') throw err;
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task');
  if (!response.ok) throw new Error(`Model download: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(bytes).digest('hex') !== 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1') throw new Error('Model checksum mismatch');
await mkdir(new URL('.', file), { recursive: true });
await writeFile(file, bytes);
console.log('Pinned hand model verified.');
