import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../worker.mjs';
import {openDB} from '../sqlite.mjs';
import {relayConfig} from '../matchmaking.mjs';
const origin='https://localhost';
function setup(){const DB=openDB();DB.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const app=createApp(),env={DB,ALLOWED_ORIGINS:origin+',https://p-patsis.github.io',APP_ORIGIN:'https://p-patsis.github.io',RP_ID:'p-patsis.github.io'};
 const call=async(path,who,data={},method='POST')=>{const r=await app.fetch(new Request('https://api.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'198.51.100.1',...(who?{Authorization:'Bearer '+who.token}:{})},...(method==='GET'?{}:{body:JSON.stringify(data)})}),env);return{status:r.status,body:await r.json()};};
 const user=async i=>{const r=await call('/players/session',null,{name:'Player '+i});assert.equal(r.status,201,JSON.stringify(r.body));return{...r.body,client:crypto.randomUUID()};};
 const request=(path,u,extra={})=>call(path,u,{client:u.client,...extra});return{DB,env,call,user,request};}
test('atomic queue pairs 40 app/browser guests without eight-slot limit, double seats or unready peers',async()=>{
 const s=setup();try{const users=[];for(let i=0;i<40;i++)users.push(await s.user(i));
 const joined=await Promise.all(users.map(u=>s.request('/queue/join',u)));assert.ok(joined.every(r=>r.status===200&&r.body.state==='preparing'));
 assert.equal(new Set(joined.map(r=>r.body.peer)).size,40);
 let r=await s.request('/queue/ready',users[0]);assert.equal(r.body.state,'waiting','unready peers cannot be selected');
 await Promise.all(users.slice(1).map(u=>s.request('/queue/ready',u)));
 const states=await Promise.all(users.map(u=>s.request('/queue/poll',u)));assert.ok(states.every(r=>r.status===200&&r.body.state==='paired'));
 const ids=new Map();states.forEach((r,i)=>{const p=r.body.pair;assert.ok([p.host,p.guest].includes(users[i].user.id));ids.set(p.id,(ids.get(p.id)||0)+1);});assert.equal(ids.size,20);assert.ok([...ids.values()].every(n=>n===2));
 const a=states[0].body.pair,b=users.find(u=>u.user.id===(a.host===users[0].user.id?a.guest:a.host));
 assert.equal((await s.request('/queue/ack',users[0],{pair:a.id})).body.pair.acknowledged,false);
 assert.equal((await s.request('/queue/ack',b,{pair:a.id})).body.pair.acknowledged,true);
 const active=await s.call('/matches/'+a.id,users[0],{},'GET');assert.equal(active.body.match.state,'active');
 const again=await s.request('/queue/ready',users[0]);assert.equal(again.body.pair.id,a.id,'idempotent ready does not create a second match');
 }finally{s.DB.close();}});
test('queue leases expire, cancellation invalidates both seats, blocked users do not pair and other tabs cannot steal a seat',async()=>{
 const s=setup();try{const a=await s.user(1),b=await s.user(2),c=await s.user(3);
 await s.DB.prepare('INSERT INTO blocks(actor,target) VALUES(?,?)').bind(a.user.id,b.user.id).run();
 await s.request('/queue/join',a);await s.request('/queue/ready',a);await s.request('/queue/join',b);assert.equal((await s.request('/queue/ready',b)).body.state,'waiting');
 assert.equal((await s.request('/queue/join',{...a,client:crypto.randomUUID()})).status,409);
 await s.request('/queue/join',c);const match=await s.request('/queue/ready',c);assert.equal(match.body.state,'paired');
 const p=match.body.pair,opponent=[a,b].find(u=>[p.host,p.guest].includes(u.user.id));assert.ok(opponent);
 assert.equal((await s.request('/queue/ack',c,{pair:crypto.randomUUID()})).status,400);
 assert.equal((await s.request('/queue/cancel',c)).status,200);assert.equal((await s.request('/queue/poll',opponent)).status,409);
 await s.request('/queue/join',c);await s.DB.prepare('UPDATE queue_tickets SET expires=0 WHERE player=?').bind(c.user.id).run();
 const d=await s.user(4);await s.request('/queue/join',d);assert.equal(await s.DB.prepare('SELECT 1 FROM queue_tickets WHERE player=?').bind(c.user.id).first(),null);
 assert.equal((await s.call('/queue/join',null,{client:crypto.randomUUID()})).status,401);
 assert.equal((await s.call('/queue/join',d,null)).status,400);
 assert.equal((await s.call('/queue/join',d,{client:'-'.repeat(36)})).status,400);
 }finally{s.DB.close();}});
test('relay config is authenticated, refuses missing secrets and never exposes API tokens',async()=>{
 const s=setup();try{const u=await s.user(1);assert.equal((await s.call('/rtc/config',null)).status,401);assert.equal((await s.call('/rtc/config',u)).status,503);
 s.env.TURN_SERVERS_JSON=JSON.stringify([{urls:['turn:relay.test.invalid:3478','turns:relay.test.invalid:443?transport=tcp'],username:'guest',credential:'temporary'}]);
 const r=await s.call('/rtc/config',u);assert.equal(r.status,200);assert.equal(r.body.managed,true);assert.ok(r.body.expires>Math.floor(Date.now()/1000));assert.equal('TURN_API_TOKEN' in r.body,false);
 }finally{s.DB.close();}});

test('managed relay mints short-lived credentials server-side and strips STUN entries and API secrets',async()=>{
 const original=globalThis.fetch;let called=false;
 globalThis.fetch=async(url,opts)=>{called=true;assert.equal(url,'https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers');assert.equal(opts.headers.Authorization,'Bearer server-only-token');assert.equal(JSON.parse(opts.body).ttl,3600);return Response.json({iceServers:[{urls:['stun:stun.cloudflare.com:3478']},{urls:['turn:turn.cloudflare.com:3478','turns:turn.cloudflare.com:443?transport=tcp'],username:'temporary-user',credential:'temporary-credential'}]});};
 try{const r=await relayConfig({TURN_KEY_ID:'key-id',TURN_API_TOKEN:'server-only-token'});assert.ok(called);assert.equal(r.iceServers.length,1);assert.ok(!JSON.stringify(r).includes('server-only-token'));assert.ok(r.expires<=Math.floor(Date.now()/1000)+3300);}
 finally{globalThis.fetch=original;}
});
test('connected queue renews its lease and deleting either identity does not strand the other seat',async()=>{
 const s=setup();try{const a=await s.user(1),b=await s.user(2);for(const u of [a,b]){await s.request('/queue/join',u);await s.request('/queue/ready',u);}
 const pair=(await s.request('/queue/poll',a)).body.pair;await s.request('/queue/ack',a,{pair:pair.id});await s.request('/queue/ack',b,{pair:pair.id});
 await s.DB.prepare('UPDATE queue_pairs SET expires=? WHERE id=?').bind(Math.floor(Date.now()/1000)+5,pair.id).run();await s.request('/queue/poll',a);
 assert.ok((await s.DB.prepare('SELECT expires FROM queue_pairs WHERE id=?').bind(pair.id).first()).expires>Math.floor(Date.now()/1000)+90);
 await s.DB.prepare('DELETE FROM users WHERE id=?').bind(a.user.id).run();const c=await s.user(3);await s.request('/queue/join',c);
 assert.equal(await s.DB.prepare('SELECT 1 FROM queue_tickets WHERE player=?').bind(b.user.id).first(),null);
 assert.equal((await s.request('/queue/join',b)).status,200);
 }finally{s.DB.close();}
});
