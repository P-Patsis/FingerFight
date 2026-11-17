import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openDB} from '../sqlite.mjs';
import {createApp} from '../worker.mjs';
import {normalizeSettings} from '../../js/logic.js';
async function setup(){
 const DB=openDB();DB.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const app=createApp(),env={DB,ALLOWED_ORIGINS:'https://localhost'};
 const call=async(path,token,data,method='POST')=>{const res=await app.fetch(new Request('https://api.test'+path,{method,headers:{Origin:'https://localhost','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method!=='GET'?{body:JSON.stringify(data||{})}:{})}),env);return{status:res.status,body:await res.json()};};
 const users=[];for(const name of ['Alice','Bob','Charlie']){const r=await call('/players/session',null,{name});assert.equal(r.status,201);await DB.prepare('UPDATE users SET registered=1 WHERE id=?').bind(r.body.user.id).run();users.push(r.body);}
 const [a,b]=users,f=await call('/friends',a.token,{code:b.user.code});await call('/friends/'+f.body.id,b.token,{accept:true},'PATCH');
 const m=await call('/matches',a.token,{opponent:b.user.id,settings:{hits:1}});await call('/matches/'+m.body.id+'/accept',b.token,{accept:true});return{DB,call,users,id:m.body.id};
}
test('leaderboard wins require two identical recomputed transcripts and cannot be replayed',async()=>{
 const s=await setup();try{const [a,b,c]=s.users,data={settings:normalizeSettings({hits:1}),rounds:[[2,2]]},path='/matches/'+s.id+'/result';
 assert.equal((await s.call(path,c.token,data)).status,404);
 const first=await s.call(path,a.token,data);assert.equal(first.body.confirmed,false);assert.equal((await s.call('/leaderboard',a.token,null,'GET')).body.leaderboard.find(x=>x.id===b.user.id).wins,0);
 const second=await s.call(path,b.token,data);assert.equal(second.body.confirmed,true);assert.equal(second.body.winner,b.user.id);
 await s.call(path,a.token,data);const row=(await s.call('/leaderboard',b.token,null,'GET')).body.leaderboard.find(x=>x.id===b.user.id);assert.equal(row.wins,1);assert.equal(row.matches,1);
 }finally{s.DB.close();}
});
test('unfinished, extra-round, forged-win and conflicting transcripts never produce a leaderboard win',async()=>{
 const s=await setup();try{const [a,b]=s.users,settings=normalizeSettings({hits:1}),path='/matches/'+s.id+'/result';
 for(const data of [{settings,rounds:[[1,2]]},{settings,rounds:[[2,2],[2,2]]},{settings,rounds:[[2,2]],winner:a.user.id}])assert.equal((await s.call(path,a.token,data)).status,400);
 assert.equal((await s.call(path,a.token,{settings,rounds:[[2,2]]})).status,200);
 assert.equal((await s.call(path,b.token,{settings,rounds:[[2,3],[2,2]]})).status,409);
 assert.equal((await s.DB.prepare('SELECT state FROM matches WHERE id=?').bind(s.id).first()).state,'active');
 }finally{s.DB.close();}
});
test('only a participant may concede and it always credits the other participant once',async()=>{
 const s=await setup();try{const [a,b,c]=s.users,path='/matches/'+s.id+'/concede';assert.equal((await s.call(path,c.token,{})).status,404);assert.equal((await s.call(path,a.token,{})).status,200);await s.call(path,a.token,{});assert.equal((await s.DB.prepare('SELECT winner FROM matches WHERE id=?').bind(s.id).first()).winner,b.user.id);}finally{s.DB.close();}
});

test('accepted friend invitations activate exactly the linked match and return its ID',async()=>{
 const s=await setup();try{const [a,b]=s.users,m=await s.call('/matches',a.token,{opponent:b.user.id,settings:{hits:1}}),inv=await s.call('/invites',a.token,{target:b.user.id,code:'ABCDEFGHJKLMNPQR',match:m.body.id});assert.equal(inv.status,201,JSON.stringify(inv.body));
 const accepted=await s.call('/invites/'+inv.body.id,b.token,{accept:true},'PATCH');assert.equal(accepted.status,200);assert.equal(accepted.body.match,m.body.id);assert.equal((await s.DB.prepare('SELECT state FROM matches WHERE id=?').bind(m.body.id).first()).state,'active');
 }finally{s.DB.close();}
});

test('a confirmed queue match ends its lease cleanly without undoing the recorded result',async()=>{
 const s=await setup();try{const [a,b]=s.users,ca=crypto.randomUUID(),cb=crypto.randomUUID();for(const [u,client]of [[a,ca],[b,cb]]){await s.call('/queue/join',u.token,{client});await s.call('/queue/ready',u.token,{client});}
 const paired=await s.call('/queue/poll',a.token,{client:ca}),id=paired.body.pair.id;await s.call('/queue/ack',a.token,{client:ca,pair:id});await s.call('/queue/ack',b.token,{client:cb,pair:id});
 const data={settings:normalizeSettings({}),rounds:[[2,2],[2,2],[2,2]]};await s.call('/matches/'+id+'/result',a.token,data);assert.equal((await s.call('/matches/'+id+'/result',b.token,data)).body.confirmed,true);
 assert.equal((await s.call('/queue/poll',a.token,{client:ca})).body.state,'finished');await s.call('/queue/cancel',a.token,{client:ca});assert.equal((await s.DB.prepare('SELECT state FROM matches WHERE id=?').bind(id).first()).state,'done');
 }finally{s.DB.close();}
});
