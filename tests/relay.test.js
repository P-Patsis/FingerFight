// Connection servers: the dead relay hosts are gone, the relay list is configurable, and a relay-only random match is refused
// (with a clear message) when no relay is configured instead of hanging forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installBrowser } from './harness.js';
import { setTurnServers, hasRelay, STUN_SERVERS, turnServers } from '../js/ice.js';
import { newPeer, Link } from '../js/net.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');
const root = path.resolve(import.meta.dirname, '..');

const seen = [];
function capture() { seen.length = 0; globalThis.Peer = function (...a) { seen.push(a); }; }

test('no source file still points at the retired PeerJS TURN hosts (they have no DNS records)', () => {
  for (const f of ['js/net.js', 'js/ice.js', 'js/main.js']) {
    const code = fs.readFileSync(path.join(root, f), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/turn\.peerjs\.com|openrelay\.metered\.ca/.test(code), f);
  }
});

test('ICE servers = the STUN list plus whatever relays are configured; bad entries are dropped', () => {
  capture(); setTurnServers([]);
  newPeer('a'); assert.deepEqual(seen[0][1].config.iceServers, STUN_SERVERS); assert.equal(hasRelay(), false);
  setTurnServers([{ urls: 'turns:relay.example:443?transport=tcp', username: 'u', credential: 'c' }, { nope: 1 }, null]);
  assert.equal(turnServers().length, 1); assert.equal(hasRelay(), true);
  capture(); newPeer('b', true);
  assert.equal(seen[0][1].config.iceServers.length, STUN_SERVERS.length + 1);
  assert.equal(seen[0][1].config.iceTransportPolicy, 'relay');
});

test('a random search (hide-IP is always on) but no relay configured is refused with an explanation', () => {
  setTurnServers([]);
  $('randomBtn').onclick();
  assert.match($('menuMsg').textContent, /always hide your IP.*none is set up/i);
  assert.equal($('cancelBtn').hidden, true, 'no search was started');
  assert.equal($('randomBtn').hidden, false);
});

test('Link.nudge is safe in every state and re-dials a dropped match at once', async () => {
  const l = new Link({});
  assert.doesNotThrow(() => l.nudge());                 // nothing open yet
  l.closed = true; assert.doesNotThrow(() => l.nudge());
});

test('the camera test screen opens and closes without a camera (simulator), leaving nothing running', async () => {
  await $('calibBtn').onclick();
  assert.deepEqual(b.visible(), ['calib']);
  assert.match($('calibMsg').textContent, /no camera/i);
  $('calibDone').onclick();
  assert.deepEqual(b.visible(), ['menu']);
  assert.equal($('camLive').hidden, true, 'the CAMERA ON badge is off');
});

test('the shipped config has STUN plus a TURN relay, so random matches are allowed', async () => {
  const fresh = await import('../js/ice.js?fresh');
  assert.ok(fresh.hasRelay());
  assert.ok(fresh.STUN_SERVERS.length >= 2);
  const urls = fresh.turnServers().flatMap(s => [].concat(s.urls));
  assert.ok(urls.includes('turn:free.expressturn.com:3478') && urls.includes('turn:free.expressturn.com:3478?transport=tcp'));
});
