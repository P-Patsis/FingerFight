// ICE (connection) servers for the peer-to-peer link.
//
// STUN lets two phones find their public addresses so they can connect directly. When a direct path is impossible
// (university / office networks, strict NAT) or when we must hide the player's IP (random matches), traffic has to go
// through a TURN RELAY, and a relay needs credentials from whoever runs it.
//
// Relay credentials are issued by the authenticated backend. No reusable provider
// password ships in updated clients. Private rooms use STUN/direct plus this fallback;
// random matches force relay-only ICE. Keep the old provider alive only for old APKs.

export const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

let turn = [];
export const turnServers = () => turn;
export const hasRelay = () => turn.length > 0;
/** For tests (and a possible settings screen): replace the relay list at run time. */
export function setTurnServers(list) { turn = Array.isArray(list) ? list.filter(s => s && s.urls) : []; }
