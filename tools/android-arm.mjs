// Project-local ARM tool; never changes the shared SDK.
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
if (process.arch !== 'arm64') throw new Error('This setup is for the ARM64 phone; configure a host-native aapt2 override on other hosts.');
const root = new URL('../.android-tools/', import.meta.url);
const binary = new URL('arm/aapt2', root);
const sha = 'db737b3bbee99dd8a9e56108cc05d032597874d3f8ac557a69f3c5de5efaf57f';
const hash = data => createHash('sha256').update(data).digest('hex');
let current;
try { current = await readFile(binary); } catch (err) { if (err.code !== 'ENOENT') throw err; }
if (!current || hash(current) !== sha) {
  const response = await fetch('https://github.com/lzhiyong/android-sdk-tools/releases/download/35.0.2/android-sdk-tools-static-aarch64.zip');
  if (!response.ok) throw new Error(`ARM tool download: HTTP ${response.status}`);
  await mkdir(new URL('arm/', root), { recursive: true });
  const zip = new URL('arm-tools.zip', root);
  await writeFile(zip, Buffer.from(await response.arrayBuffer()));
  const { fileURLToPath } = await import('node:url');
  current = execFileSync('unzip', ['-p', fileURLToPath(zip), 'build-tools/aapt2'], { maxBuffer: 10_000_000 });
  if (hash(current) !== sha) throw new Error('ARM aapt2 checksum mismatch');
  await writeFile(binary, current);
}
await chmod(binary, 0o755);
console.log('Pinned ARM aapt2 verified.');
