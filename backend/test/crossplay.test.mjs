import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openDB} from '../sqlite.mjs';
import {createApp} from '../worker.mjs';
import {Service} from '../../js/service.js';
import {Matchmaker} from '../../js/matchmaking.js';
import {turnServers} from '../../js/ice.js';
import {Link,newToken} from '../../js/net.js';
import {FakePeer,network} from '../../tests/harness.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const store=()=>{const data=new Map();return{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
function setup(){const DB=openDB();DB.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const app=createApp();const env={DB,ALLOWED_ORIGINS:'https://localhost,https://p-patsis.github.io',TURN_SERVERS_JSON:JSON.stringify([{urls:'turn:relay.invalid:3478',username:'temporary',credential:'test'}])};
 const service=origin=>new Service('https://api.test',{storage:store(),fetch:(url,opts)=>app.fetch(new Request(url,{...opts,headers:{...opts.headers,Origin:origin,'CF-Connecting-IP':'192.0.2.1'}}),env)});return{DB,service};}
test('native and website guests use the same API queue and exchange authenticated PeerJS game messages',async()=>{
 globalThis.Peer=FakePeer;network.clear();const s=setup(),a=s.service('https://localhost'),b=s.service('https://p-patsis.github.io');
 const legacyRelays=turnServers();
 const players=[a,b].map(service=>({service,maker:new Matchmaker(service,{storage:store(),pollMs:100,timeout:5000}),got:[],link:null,pair:null}));
 try{
 await Promise.all(players.map((p,i)=>p.maker.start('Player '+i,{
  openPeer:async (id,iceServers)=>{p.link=new Link({onOpen:()=>{if(p.pair?.role==='guest')p.link.send({t:'hello',pair:p.link.pairProof(),token:p.link.token});},onMessage:m=>{p.got.push(m);if(m.t==='hello'){p.link.setToken(m.token);p.link.send({t:'welcome',pair:p.link.pairProof()});}}},{relay:true,iceServers});await p.link.host(id);},
  onPair:pair=>{p.pair=pair;p.link.expectPair(pair);if(pair.role==='guest')p.link.setToken(newToken());},
  connect:async pair=>{if(pair.role==='guest')await p.link.dialRegistered(pair.hostPeer);const end=Date.now()+2000;while(!p.got.some(m=>['hello','welcome'].includes(m.t))){if(Date.now()>end)throw new Error('handshake failed');await sleep(5);}},
 })));
 assert.equal(players[0].pair.id,players[1].pair.id);assert.notEqual(players[0].pair.role,players[1].pair.role);
 assert.equal(network.size,2,'both peer IDs were registered before pairing');assert.ok(players.every(p=>p.link.relay&&p.link.iceServers?.[0].urls==='turn:relay.invalid:3478'));assert.equal(turnServers(),legacyRelays,'short-lived queue credentials do not replace private/legacy relays');
 players[0].link.send({t:'guess',n:2});await sleep(20);assert.ok(players[1].got.some(m=>m.t==='guess'&&m.n===2));
 const refreshed=[{urls:'turns:renewed.invalid:443',username:'renewed',credential:'temporary'}];players[0].link.setRelayServers(refreshed);
 assert.ok(players[0].link.peer.options.config.iceServers.some(s=>s.urls==='turns:renewed.invalid:443'));assert.equal(players[0].link.peer.options.config.iceTransportPolicy,'relay');assert.equal(turnServers(),legacyRelays);
 const host=players.find(p=>p.pair.role==='host'),intruder=new FakePeer('outsider');await sleep(5);const attack=intruder.connect(host.pair.hostPeer);await sleep(15);attack.send({t:'hello',pair:host.link.pairProof(),token:newToken()});await sleep(15);
 assert.equal(host.got.filter(m=>m.t==='hello').length,1,'wrong peer ID cannot take an assigned seat, even with copied handshake');intruder.destroy();
 await players[0].maker.cancel();await assert.rejects(()=>players[1].service.request('/queue/poll','POST',{client:players[1].maker.client}),e=>e.status===409);
 }finally{await Promise.all(players.map(p=>p.maker.cancel()));players.forEach(p=>p.link?.close());network.clear();s.DB.close();}
});
test('configured relay failure fails visibly before creating a ticket and never falls back to public slots',async()=>{
 const s=setup();const service=s.service('https://localhost'),maker=new Matchmaker(service,{storage:store()});service.prepareRelay=async()=>{throw new Error('Multiplayer relay is not configured');};let opened=false;
 try{await assert.rejects(()=>maker.start('Player',{openPeer:()=>{opened=true;}}),/not configured/);assert.equal(opened,false);assert.equal((await s.DB.prepare('SELECT count(*) n FROM queue_tickets').first()).n,0);}finally{await maker.cancel();s.DB.close();}
});
test('cancel during registration cleans a late-created ticket',async()=>{
 const s=setup(),service=s.service('https://localhost'),maker=new Matchmaker(service,{storage:store(),pollMs:5});let release,entered;
 const started=new Promise(r=>entered=r),block=new Promise(r=>release=r),request=service.request.bind(service);let old;
 service.request=async(path,...args)=>{if(path==='/queue/join'){old=args[1].client;entered();await block;}return request(path,...args);};
 try{const work=maker.start('Player',{openPeer:()=>{throw new Error('should be cancelled');}});await started;const cancelling=maker.cancel();release();await cancelling;await assert.rejects(()=>work,/cancelled/);assert.equal((await s.DB.prepare('SELECT count(*) n FROM queue_tickets').first()).n,0);assert.match(old,/^[a-f0-9-]{36}$/);}finally{release?.();await maker.cancel();s.DB.close();}
});

test('assigned peer cannot send game data before proving the queue secret',async()=>{
 globalThis.Peer=FakePeer;network.clear();const delivered=[];
 const pair={id:crypto.randomUUID(),key:'a'.repeat(48),hostPeer:'ffight-q-'+'b'.repeat(48),guestPeer:'ffight-q-'+'c'.repeat(48)};
 const host=new Link({onMessage:m=>delivered.push(m)});host.expectPair(pair);let guest;
 try{await host.host(pair.hostPeer);guest=new FakePeer(pair.guestPeer);await sleep(10);const c=guest.connect(pair.hostPeer);await sleep(10);
  c.send({t:'guess',n:1,guess:2});c.send({t:'hello',pair:{id:pair.id,key:'d'.repeat(48)}});await sleep(20);
  assert.equal(delivered.length,0);assert.equal(c.open,false);
 }finally{host.close();guest?.destroy();network.clear();}
});
