import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp,roundCommitment} from '../worker.mjs';
import {openDB} from '../sqlite.mjs';
import {authenticator} from './authenticator.mjs';
const ORIGIN='https://p-patsis.github.io';
function setup(){const DB=openDB();DB.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const env={DB,ALLOWED_ORIGINS:ORIGIN,APP_ORIGIN:ORIGIN,RP_ID:'p-patsis.github.io'},app=createApp();let ip=0;
 const call=async(path,method='GET',data,token,origin=ORIGIN)=>{const res=await app.fetch(new Request('https://api.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),'CF-Connecting-IP':'192.0.2.'+ip},...(data===undefined?{}:{body:JSON.stringify(data)})}),env);return {status:res.status,body:await res.json(),headers:res.headers};};
 const user=async(name)=>{ip++;const g=await call('/auth/guest','POST',{name});assert.equal(g.status,201);const a=await authenticator(),o=await call('/auth/register/options','POST',{},g.body.token),v=await call('/auth/register/verify','POST',{id:o.body.id,response:await a.register(o.body.options.challenge)},g.body.token);assert.equal(v.status,200,JSON.stringify(v.body));return {...v.body,authenticator:a,guestToken:g.body.token};};
 return {DB,env,app,call,user};}
const friend=async(s,a,b)=>{const r=await s.call('/friends','POST',{code:b.user.code},a.token);assert.equal(r.status,201);assert.equal((await s.call('/friends/'+r.body.id,'PATCH',{accept:true},b.token)).status,200);return r.body.id;};
test('real passkey registration/login rotates tokens, rejects replay and forged origins/signatures',async()=>{
 const s=setup();try{const a=await s.user('Alice');assert.equal(a.user.registered,true);assert.equal((await s.call('/me','GET',undefined,a.guestToken)).status,401);
 const options=await s.call('/auth/login/options','POST',{}),response=await a.authenticator.login(options.body.options.challenge),login=await s.call('/auth/login/verify','POST',{id:options.body.id,response});assert.equal(login.status,200,JSON.stringify(login.body));assert.equal(login.body.user.id,a.user.id);
 assert.equal((await s.call('/auth/login/verify','POST',{id:options.body.id,response})).status,400,'challenge is one use');
 const o=await s.call('/auth/login/options','POST',{}),fake=await a.authenticator.login(o.body.options.challenge);fake.response.signature='AAAA';assert.equal((await s.call('/auth/login/verify','POST',{id:o.body.id,response:fake})).status,401);
 assert.equal((await s.call('/me','GET',undefined,login.body.token,'https://evil.example')).status,403);assert.equal((await s.call('/me','GET')).status,401);
 assert.equal((await s.call('/auth/logout','POST',{},login.body.token)).status,200);assert.equal((await s.call('/me','GET',undefined,login.body.token)).status,401);
 }finally{s.DB.close();}});
test('friend approval, expiring invites, blocks and reports are authenticated and scoped to the current player',async()=>{
 const s=setup();try{const a=await s.user('Alice'),b=await s.user('Bob'),c=await s.user('Carol');
 assert.equal((await s.call('/invites','POST',{target:b.user.id,code:'ABCDEFGHJKLMNPQR'},a.token)).status,403);
 const r=await s.call('/friends','POST',{code:b.user.code},a.token);assert.equal(r.status,201);assert.equal((await s.call('/friends/'+r.body.id,'PATCH',{accept:true},c.token)).status,404);assert.equal((await s.call('/friends/'+r.body.id,'PATCH',{accept:true},b.token)).status,200);
 const inv=await s.call('/invites','POST',{target:b.user.id,code:'ABCDEFGHJKLMNPQR'},a.token);assert.equal(inv.status,201);assert.equal((await s.call('/invites/'+inv.body.id,'PATCH',{accept:true},c.token)).status,404);const accepted=await s.call('/invites/'+inv.body.id,'PATCH',{accept:true},b.token);assert.equal(accepted.body.code,'ABCDEFGHJKLMNPQR');
 assert.equal((await s.call('/reports','POST',{target:b.user.id,reason:'abuse',detail:'Repeated insults'},a.token)).body.status,'received');assert.equal((await s.call('/reports','GET',undefined,b.token)).status,404,'reports are not publicly readable');
 assert.equal((await s.call('/blocks','POST',{target:b.user.id},a.token)).status,200);assert.equal((await s.call('/friends','GET',undefined,a.token)).body.friends.length,0);assert.equal((await s.call('/friends','POST',{code:a.user.code},b.token)).status,403);assert.equal((await s.call('/invites','POST',{target:a.user.id,code:'ABCDEFGHJKLMNPQR'},b.token)).status,403);
 }finally{s.DB.close();}});
test('server scores committed/revealed rounds exactly once; third parties and fake win uploads cannot alter standings',async()=>{
 const s=setup();try{const a=await s.user('Alice'),b=await s.user('Bob'),c=await s.user('Carol');await friend(s,a,b);
 const m=await s.call('/matches','POST',{opponent:b.user.id,settings:{hits:1,maxFingers:5}},a.token);assert.equal(m.status,201);const mid=m.body.id;
 assert.equal((await s.call('/matches/'+mid+'/accept','POST',{accept:true},a.token)).status,403);assert.equal((await s.call('/matches/'+mid+'/accept','POST',{accept:true},b.token)).status,200);assert.equal((await s.call('/matches/'+mid,'GET',undefined,c.token)).status,404);
 const nonceA='a'.repeat(64),nonceB='b'.repeat(64);await s.call('/matches/'+mid+'/turn','POST',{round:1,commitment:await roundCommitment(mid,1,3,nonceA)},a.token);
 assert.equal((await s.call('/matches/'+mid+'/turn','POST',{round:1,value:3,nonce:nonceA},a.token)).status,409,'cannot peek before both commits');await s.call('/matches/'+mid+'/turn','POST',{round:1,commitment:await roundCommitment(mid,1,3,nonceB)},b.token);
 assert.equal((await s.call('/matches/'+mid+'/turn','POST',{round:1,value:4,nonce:nonceA},a.token)).status,409,'cannot change committed count');await s.call('/matches/'+mid+'/turn','POST',{round:1,value:3,nonce:nonceA},a.token);
 const done=await s.call('/matches/'+mid+'/turn','POST',{round:1,value:3,nonce:nonceB},b.token);assert.equal(done.body.match.state,'done');assert.equal(done.body.match.winner,b.user.id);assert.equal(done.body.match.health.host,0);
 assert.equal((await s.call('/matches/'+mid+'/turn','POST',{round:1,value:3,nonce:nonceB},b.token)).status,409);const board=await s.call('/leaderboard','GET',undefined,a.token);assert.equal(board.body.leaderboard.find(u=>u.id===b.user.id).wins,1);assert.equal(board.body.leaderboard.some(u=>u.id===c.user.id),false);
 assert.equal((await s.call('/leaderboard','POST',{wins:999},a.token)).status,404);
 }finally{s.DB.close();}});
test('body bounds, rate limits, guest restrictions and recent-auth account deletion are enforced',async()=>{
 const s=setup();try{
 const g=await s.call('/auth/guest','POST',{name:'Guest'});assert.equal((await s.call('/friends','GET',undefined,g.body.token)).status,403);assert.equal((await s.call('/me','DELETE',{confirm:true},g.body.token)).status,403);
 for(let i=0;i<4;i++)assert.equal((await s.call('/auth/guest','POST',{})).status,201);assert.equal((await s.call('/auth/guest','POST',{})).status,429);
 const huge=await s.app.fetch(new Request('https://api.test/auth/guest',{method:'POST',headers:{Origin:ORIGIN,'CF-Connecting-IP':'other'},body:'x'.repeat(20001)}),s.env);assert.equal(huge.status,413);
 const a=await s.user('Alice');assert.equal((await s.call('/me','DELETE',{confirm:true},a.token)).status,200);assert.equal((await s.call('/me','GET',undefined,a.token)).status,401);
 }finally{s.DB.close();}});

test('passkey challenge expiry and embedded origin checks reject invalid registration',async()=>{
 const s=setup();try{const guest=await s.call('/auth/guest','POST',{name:'Guest'}),t=guest.body.token;
 const expired=await s.call('/auth/register/options','POST',{},t);await s.DB.prepare('UPDATE challenges SET expires=0 WHERE id=?').bind(expired.body.id).run();const a=await authenticator();assert.equal((await s.call('/auth/register/verify','POST',{id:expired.body.id,response:await a.register(expired.body.options.challenge)},t)).status,400);
 const wrong=await s.call('/auth/register/options','POST',{},t),evil=await authenticator('p-patsis.github.io','https://evil.example');assert.equal((await s.call('/auth/register/verify','POST',{id:wrong.body.id,response:await evil.register(wrong.body.options.challenge)},t)).status,401);
 assert.equal((await s.call('/auth/login/verify','POST',{})).status,400);assert.equal((await s.call('/reports','POST',{},t)).status,403);
 }finally{s.DB.close();}});

test('browser API client completes real passkey signup/login, friendship and a two-player committed match',async()=>{
 const {Service}=await import('../../js/service.js'),s=setup();try{
  const client=async name=>{const a=await authenticator(),storage=new Map(),fetch=async(url,options)=>{const req=new Request(url,options);req.headers.set('Origin',ORIGIN);return s.app.fetch(req,s.env);},credentials={async create({publicKey:o}){assert.ok(o.challenge instanceof Uint8Array);const response=await a.register(Buffer.from(o.challenge).toString('base64url'));return {toJSON:()=>response};},async get({publicKey:o}){const response=await a.login(Buffer.from(o.challenge).toString('base64url'));return {toJSON:()=>response};}},api=new Service('https://api.test',{fetch,credentials,storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});await api.register(name);return api;};
  const a=await client('Alice'),b=await client('Bob');const f=await a.request('/friends','POST',{code:b.user.code});await b.request('/friends/'+f.id,'PATCH',{accept:true});
  const m=await a.request('/matches','POST',{opponent:b.user.id,settings:{hits:1}});await b.request('/matches/'+m.id+'/accept','POST',{accept:true});
  const results=await Promise.all([a.lockRound(m.id,1,2),b.lockRound(m.id,1,2)]);assert.equal(results[0].winner,b.user.id);assert.deepEqual(results[0],results[1]);
  const uid=a.user.id;await a.logout();await a.login();assert.equal(a.user.id,uid);assert.equal((await b.request('/leaderboard')).leaderboard.find(p=>p.id===b.user.id).wins,1);
 }finally{s.DB.close();}});

test('server minimum uses paired turns and rejects a zero at the two-finger floor',async()=>{
 const s=setup();try{const a=await s.user('Alice'),b=await s.user('Bob');await friend(s,a,b);const m=await s.call('/matches','POST',{opponent:b.user.id,settings:{hits:2,maxFingers:5}},a.token);await s.call('/matches/'+m.body.id+'/accept','POST',{accept:true},b.token);await s.DB.prepare('UPDATE matches SET round=9 WHERE id=?').bind(m.body.id).run();
 const nonce='a'.repeat(64),other='b'.repeat(64);await s.call('/matches/'+m.body.id+'/turn','POST',{round:9,commitment:await roundCommitment(m.body.id,9,0,nonce)},a.token);await s.call('/matches/'+m.body.id+'/turn','POST',{round:9,commitment:await roundCommitment(m.body.id,9,1,other)},b.token);assert.equal((await s.call('/matches/'+m.body.id+'/turn','POST',{round:9,value:0,nonce},a.token)).status,400);
 }finally{s.DB.close();}});

test('server applies the shared three-idle-round forfeit and cancelled matches never enter the leaderboard',async()=>{
 const s=setup();try{const a=await s.user('Alice'),b=await s.user('Bob');await friend(s,a,b);const created=await s.call('/matches','POST',{opponent:b.user.id,settings:{hits:2}},a.token),mid=created.body.id;await s.call('/matches/'+mid+'/accept','POST',{accept:true},b.token);let done;
 for(let round=1;round<=3;round++){
  const na='a'.repeat(63)+round,nb='b'.repeat(63)+round;await s.call('/matches/'+mid+'/turn','POST',{round,commitment:await roundCommitment(mid,round,null,na)},a.token);await s.call('/matches/'+mid+'/turn','POST',{round,commitment:await roundCommitment(mid,round,2,nb)},b.token);await s.call('/matches/'+mid+'/turn','POST',{round,value:null,nonce:na},a.token);done=await s.call('/matches/'+mid+'/turn','POST',{round,value:2,nonce:nb},b.token);
 }
 assert.equal(done.body.match.state,'done');assert.equal(done.body.match.winner,b.user.id);assert.equal(done.body.match.forfeit,a.user.id);assert.deepEqual(done.body.match.health,{host:2,guest:2});
 const cancelled=await s.call('/matches','POST',{opponent:b.user.id,settings:{}},a.token);assert.equal((await s.call('/matches/'+cancelled.body.id+'/cancel','POST',{},a.token)).status,200);assert.equal((await s.call('/matches/'+cancelled.body.id,'GET',undefined,a.token)).body.match.state,'abandoned');assert.equal((await s.call('/leaderboard','GET',undefined,b.token)).body.leaderboard.find(p=>p.id===b.user.id).matches,1);
 }finally{s.DB.close();}});
