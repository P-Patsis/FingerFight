import {normalizeSettings} from '../js/logic.js';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const now=()=>Math.floor(Date.now()/1000);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
export class QueueError extends Error{constructor(status,message){super(message);this.status=status;}}
const need=(ok,status,message)=>{if(!ok)throw new QueueError(status,message);};
const clean=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
const DEFAULT=normalizeSettings({});
export async function cleanQueue(db){
 const t=now();await db.batch([
  q(db,"UPDATE matches SET state='abandoned',winner=NULL WHERE id IN (SELECT id FROM queue_pairs WHERE expires<? AND state<>'cancelled') AND state IN ('pending','active')",t),
  q(db,"UPDATE queue_pairs SET state='cancelled' WHERE expires<?",t),
  q(db,"DELETE FROM queue_tickets WHERE (pair_id IS NULL AND expires<?) OR pair_id IN (SELECT id FROM queue_pairs WHERE state='cancelled') OR (pair_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM queue_pairs WHERE id=queue_tickets.pair_id))",t),
  q(db,'DELETE FROM queue_pairs WHERE expires<?',t-86400)
 ]);
}
async function ticket(db,user,client){
 const row=await q(db,'SELECT * FROM queue_tickets WHERE player=?',user).first();
 need(row&&row.client===client,409,'Search expired or is open in another tab; start again');return row;
}
async function state(db,user,client){
 const own=await ticket(db,user,client);await q(db,'UPDATE queue_tickets SET expires=? WHERE player=? AND client=?',now()+90,user,client).run();
 if(!own.pair_id)return{state:own.ready?'waiting':'preparing',peer:own.peer};
 const pair=await q(db,'SELECT p.*,m.host,m.guest,m.settings,m.state match_state FROM queue_pairs p JOIN matches m ON m.id=p.id WHERE p.id=?',own.pair_id).first();
 need(pair&&pair.state!=='cancelled'&&pair.match_state!=='abandoned'&&pair.match_state!=='done'&&pair.expires>now(),409,'The other player left; start another search');
 if(pair.state==='connected')await q(db,"UPDATE queue_pairs SET expires=? WHERE id=? AND state='connected' AND expires>?",now()+120,pair.id,now()).run();
 const role=pair.host===user?'host':'guest';
 return{state:pair.state==='connected'?'connected':'paired',peer:own.peer,pair:{id:pair.id,key:pair.secret,role,host:pair.host,guest:pair.guest,hostPeer:pair.host_peer,guestPeer:pair.guest_peer,settings:JSON.parse(pair.settings),acknowledged:!!pair.ack_host&&!!pair.ack_guest}};
}
export async function handleQueue(path,method,data,user,db){
 need(clean(data,['client','pair'])&&uuid(data.client),400,'Invalid search identifier');if(path==='/queue/join'||path==='/queue/ready')await cleanQueue(db);
 if(path==='/queue/join'&&method==='POST'){
  need(clean(data,['client']),400,'Invalid search request');
  const old=await q(db,'SELECT client FROM queue_tickets WHERE player=?',user.id).first();need(!old||old.client===data.client,409,'Already searching in another tab');
  await q(db,'INSERT INTO queue_tickets(player,client,peer,joined,expires) VALUES(?,?,?,?,?) ON CONFLICT(player) DO UPDATE SET expires=excluded.expires',user.id,data.client,'ffight-q-'+secret(),now(),now()+90).run();
  return state(db,user.id,data.client);
 }
 const own=await ticket(db,user.id,data.client);
 if(path==='/queue/cancel'&&method==='POST'){
  need(clean(data,['client']),400,'Invalid cancellation');
  if(own.pair_id)await db.batch([
   q(db,"UPDATE queue_pairs SET state='cancelled',expires=? WHERE id=?",now(),own.pair_id),
   q(db,"UPDATE matches SET state='abandoned',winner=NULL WHERE id=? AND state IN ('pending','active')",own.pair_id),
   q(db,'DELETE FROM queue_tickets WHERE pair_id=?',own.pair_id)
  ]);else await q(db,'DELETE FROM queue_tickets WHERE player=? AND client=?',user.id,data.client).run();
  return{ok:true};
 }
 if(path==='/queue/ready'&&method==='POST'){
  need(clean(data,['client']),400,'Invalid ready request');
  const pid=crypto.randomUUID(),key=secret(),t=now();
  // Every statement runs in the same D1 transaction. Concurrent callers cannot claim an already-paired player.
  await db.batch([
   q(db,'UPDATE queue_tickets SET ready=1,expires=? WHERE player=? AND client=?',t+90,user.id,data.client),
   q(db,`WITH candidate AS MATERIALIZED (
      SELECT t.player FROM queue_tickets t WHERE t.player<>? AND t.ready=1 AND t.pair_id IS NULL AND t.expires>?
      AND NOT EXISTS(SELECT 1 FROM blocks WHERE (actor=? AND target=t.player) OR (actor=t.player AND target=?))
      ORDER BY t.joined,t.player LIMIT 1
    ), own AS MATERIALIZED (SELECT player FROM queue_tickets WHERE player=? AND client=? AND pair_id IS NULL),
    claimants AS MATERIALIZED (SELECT player FROM own UNION ALL SELECT player FROM candidate)
    UPDATE queue_tickets SET pair_id=? WHERE pair_id IS NULL AND player IN (SELECT player FROM claimants) AND (SELECT count(*) FROM claimants)=2`,user.id,t,user.id,user.id,user.id,data.client,pid),
   q(db,`INSERT INTO matches(id,host,guest,settings,hp_host,hp_guest,created)
      SELECT ?,a.player,b.player,?,?,?,? FROM queue_tickets a JOIN queue_tickets b ON a.pair_id=b.pair_id
      WHERE a.pair_id=? AND a.player<>? AND b.player=?`,pid,JSON.stringify(DEFAULT),DEFAULT.hits,DEFAULT.hits,t,pid,user.id,user.id),
   q(db,`INSERT INTO queue_pairs(id,secret,host_peer,guest_peer,expires)
      SELECT ?,?,a.peer,b.peer,? FROM queue_tickets a JOIN queue_tickets b ON a.pair_id=b.pair_id
      WHERE a.pair_id=? AND a.player<>? AND b.player=?`,pid,key,t+60,pid,user.id,user.id)
  ]);
  return state(db,user.id,data.client);
 }
 if(path==='/queue/poll'&&method==='POST'){need(clean(data,['client']),400,'Invalid poll');return state(db,user.id,data.client);}
 if(path==='/queue/ack'&&method==='POST'){
  need(clean(data,['client','pair'])&&uuid(data.pair)&&own.pair_id===data.pair,400,'Invalid match acknowledgement');
  const pair=await q(db,'SELECT m.host,m.guest,p.* FROM matches m JOIN queue_pairs p ON p.id=m.id WHERE m.id=?',data.pair).first();
  need(pair&&pair.expires>now()&&pair.state!=='cancelled',409,'Match expired');
  need(!await q(db,'SELECT 1 FROM blocks WHERE (actor=? AND target=?) OR (actor=? AND target=?)',pair.host,pair.guest,pair.guest,pair.host).first(),403,'This connection is unavailable');
  const col=pair.host===user.id?'ack_host':'ack_guest';
  await db.batch([
   q(db,`UPDATE queue_pairs SET ${col}=1,expires=? WHERE id=? AND state<>'cancelled'`,now()+120,data.pair),
   q(db,"UPDATE queue_pairs SET state='connected' WHERE id=? AND state='pending' AND ack_host=1 AND ack_guest=1",data.pair),
   q(db,"UPDATE matches SET state='active' WHERE id=? AND state='pending' AND EXISTS(SELECT 1 FROM queue_pairs WHERE id=? AND state='connected')",data.pair,data.pair)
  ]);
  return state(db,user.id,data.client);
 }
 need(false,404,'Not found');
}
export async function relayConfig(env){
 if(env.TURN_SERVERS_JSON){let ice;try{ice=JSON.parse(env.TURN_SERVERS_JSON);}catch{need(false,503,'Relay configuration unavailable');}
  need(Array.isArray(ice)&&ice.length>0&&ice.length<=8&&ice.every(s=>s&&typeof s.username==='string'&&s.username.length<=1024&&typeof s.credential==='string'&&s.credential.length<=1024&&(Array.isArray(s.urls)?s.urls:[s.urls]).length>0&&(Array.isArray(s.urls)?s.urls:[s.urls]).length<=8&&(Array.isArray(s.urls)?s.urls:[s.urls]).every(u=>typeof u==='string'&&u.length<=512&&/^turns?:[^\s]+$/.test(u))),503,'Relay configuration unavailable');
  return{iceServers:ice,expires:now()+600,managed:true};
 }
 need(env.TURN_KEY_ID&&env.TURN_API_TOKEN,503,'Multiplayer relay is not configured');
 const response=await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/'+encodeURIComponent(env.TURN_KEY_ID)+'/credentials/generate-ice-servers',{method:'POST',headers:{Authorization:'Bearer '+env.TURN_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({ttl:3600}),signal:AbortSignal.timeout(10000)});
 need(response.ok,503,'Could not prepare multiplayer relay');const result=await response.json();
 const servers=(Array.isArray(result.iceServers)?result.iceServers:[result.iceServers]).filter(s=>s&&typeof s.username==='string'&&typeof s.credential==='string').map(s=>({username:s.username,credential:s.credential,urls:(Array.isArray(s.urls)?s.urls:[s.urls]).filter(u=>typeof u==='string'&&/^turns?:[^\s]+$/.test(u))})).filter(s=>s.urls.length>0);
 need(servers.length>0,503,'Relay configuration unavailable');return{iceServers:servers,expires:now()+3300,managed:true};
}
