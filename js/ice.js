// ICE (connection) servers for the peer-to-peer link.
//
// STUN lets two phones find their public addresses so they can connect directly. When a direct path is impossible
// (university / office networks, strict NAT) or when we must hide the player's IP (random matches), traffic has to go
// through a TURN RELAY, and a relay needs credentials from whoever runs it.
//
// RELAY: ExpressTURN free tier (free.expressturn.com). Endpoints probed 2026-10-27: UDP 3478 and TCP 3478 answer; port 443
// presents a certificate for a different hostname (so no "turns:" entry), and 80 / 5349 gave no STUN reply, so only the two
// confirmed endpoints are listed. TCP 3478 is the fallback for networks that block UDP.
// NOTE: these credentials are free and revocable, and they are PUBLIC (they ship in the web page, visible to everyone).
// Rotate them from the ExpressTURN dashboard and paste the new ones below whenever needed.
// (The TURN hosts PeerJS ships, eu-0 / us-0.turn.peerjs.com, have no DNS records any more, which is why this list is our own.)
// Direct connection is always tried first (STUN); the relay is only the fallback, and the only path for random matches.

export const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

let turn = [{
  urls: ['turn:free.expressturn.com:3478', 'turn:free.expressturn.com:3478?transport=tcp'],
  username: '000000002108479589',
  credential: '3iaeA2Vv+zG2ziyYf3zgP6+vck4=',
}];
export const turnServers = () => turn;
export const hasRelay = () => turn.length > 0;
/** For tests (and a possible settings screen): replace the relay list at run time. */
export function setTurnServers(list) { turn = Array.isArray(list) ? list.filter(s => s && s.urls) : []; }
