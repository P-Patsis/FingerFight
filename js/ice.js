// ICE (connection) servers for the peer-to-peer link.
//
// STUN lets two phones find their public addresses so they can connect directly. When a direct path is impossible
// (university / office networks, strict NAT) or when we must hide the player's IP (random matches), traffic has to go
// through a TURN RELAY, and a relay needs credentials from whoever runs it.
//
// STATUS (checked 2026-10-27): the TURN hosts that PeerJS ships by default (eu-0 / us-0.turn.peerjs.com) have NO DNS
// records any more, and openrelay.metered.ca resolves to a reserved test address, so there is NO working free relay
// without an account. Until one is configured below, random matches (which are relay-only) cannot connect, and the
// game says so instead of hanging.
//
// TO ENABLE A RELAY: create a free account with a TURN provider (e.g. Metered, ExpressTURN, Cloudflare Calls) and put the
// values it gives you here. Prefer entries on TCP/443 ("turns:") because they also pass strict networks. Example:
//   { urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:443?transport=tcp', 'turns:global.relay.metered.ca:443?transport=tcp'],
//     username: 'YOUR_USERNAME', credential: 'YOUR_CREDENTIAL' }
// (A TURN username/credential in a web page is visible to everyone; use a provider key that can be revoked.)

export const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

let turn = [];                                            // edit here: the relay servers to use
export const turnServers = () => turn;
export const hasRelay = () => turn.length > 0;
/** For tests (and a possible settings screen): replace the relay list at run time. */
export function setTurnServers(list) { turn = Array.isArray(list) ? list.filter(s => s && s.urls) : []; }
