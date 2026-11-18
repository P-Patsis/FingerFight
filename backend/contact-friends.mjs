// Account-optional friend requests bound to an authenticated match/contact card.
import {QueueError} from './matchmaking.mjs';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args),now=()=>Math.floor(Date.now()/1000);
const need=(v,status,message)=>{if(!v)throw new QueueError(status,message);};
const strict=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const room=v=>typeof v==='string'&&/^[A-HJ-NP-Z2-9]{16}$/.test(v);
export async function contactCard(db,user,data){
 need(strict(data,['room'])&&room(data.room),400,'Invalid private room');
 await q(db,'DELETE FROM contact_cards WHERE expires<=?',now()).run();
 const card=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 await q(db,'INSERT INTO contact_cards(hash,user_id,room_hash,expires) VALUES(?,?,?,?)',await hash(card),user.id,await hash(data.room),now()+86400).run();
 return{card};
}
export async function friendFromMatch(db,user,data){
 need(strict(data,['card','room','match','request'])&&(data.request===undefined||typeof data.request==='boolean'),400,'Invalid friend request');
 let target;
 if(data.match!==undefined){
  need(typeof data.match==='string'&&/^[a-f0-9-]{36}$/.test(data.match)&&data.card===undefined&&data.room===undefined,400,'Invalid match');
  const m=await q(db,"SELECT host,guest FROM matches WHERE id=? AND (host=? OR guest=?) AND state IN ('active','done')",data.match,user.id,user.id).first();need(m,404,'Match not found');target=m.host===user.id?m.guest:m.host;
 }else{
  need(typeof data.card==='string'&&/^[A-Za-z0-9_-]{43}$/.test(data.card)&&room(data.room),400,'Invalid contact card');
  const card=await q(db,'SELECT user_id FROM contact_cards WHERE hash=? AND room_hash=? AND expires>?',await hash(data.card),await hash(data.room),now()).first();need(card,410,'Contact card expired; reconnect to refresh it');target=card.user_id;
 }
 need(target!==user.id,400,'Choose another player');
 need(!await q(db,'SELECT 1 FROM blocks WHERE (actor=? AND target=?) OR (actor=? AND target=?)',user.id,target,target,user.id).first(),403,'This player is unavailable');
 const person=await q(db,'SELECT name,code FROM users WHERE id=?',target).first();need(person,404,'Player not found');
 let r=await q(db,'SELECT * FROM friends WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',user.id,target,target,user.id).first(),changed=false;
 if(data.request!==false){
  if(!r){const id=crypto.randomUUID();await q(db,"INSERT OR IGNORE INTO friends(id,sender,recipient,status,created) VALUES(?,?,?,'pending',?)",id,user.id,target,now()).run();r=await q(db,'SELECT * FROM friends WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',user.id,target,target,user.id).first();changed=true;}
  if(r.status==='pending'&&r.recipient===user.id){await q(db,"UPDATE friends SET status='accepted' WHERE id=? AND recipient=? AND status='pending'",r.id,user.id).run();r={...r,status:'accepted'};changed=true;}
 }
 return{other:target,name:person.name,code:person.code,status:r?.status||'none',incoming:r?.status==='pending'&&r.recipient===user.id,changed};
}
