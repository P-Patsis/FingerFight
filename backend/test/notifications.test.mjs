import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openDB} from '../sqlite.mjs';
import {createApp} from '../worker.mjs';
import {dispatchPush,sendPush,validSubscription} from '../notifications.mjs';
const base64=b=>Buffer.from(b).toString('base64url');
async function setup(){
 const DB=openDB();DB.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const app=createApp(),key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),pub=new Uint8Array(await crypto.subtle.exportKey('raw',key.publicKey)),priv=await crypto.subtle.exportKey('jwk',key.privateKey);
 const env={DB,ALLOWED_ORIGINS:'https://localhost',APP_ORIGIN:'https://p-patsis.github.io',VAPID_PUBLIC_KEY:base64(pub),VAPID_PRIVATE_KEY:priv.d};
 const call=async(path,token,data,method='POST')=>{const r=await app.fetch(new Request('https://api.test'+path,{method,headers:{Origin:'https://localhost','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method!=='GET'?{body:JSON.stringify(data||{})}:{})}),env);return{status:r.status,body:await r.json()};};
 const users=[];for(const name of ['Alice','Bob']){const r=await call('/players/session',null,{name});await DB.prepare('UPDATE users SET registered=1 WHERE id=?').bind(r.body.user.id).run();users.push(r.body);}
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test-'+crypto.randomUUID(),expirationTime:null,keys:{p256dh:base64(pub),auth:base64(crypto.getRandomValues(new Uint8Array(16)))}};
 return{DB,env,call,users,sub};
}
test('push is opt-in, subscription endpoints are constrained and account/device ownership is enforced',async()=>{
 const s=await setup();try{const [a,b]=s.users,id=crypto.randomUUID();assert.equal((await s.call('/notifications/subscribe',null,{id,platform:'web',subscription:s.sub})).status,401);
 for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/private','https://evil.example/x','https://fcm.googleapis.com:444/x','https://fcm.googleapis.com@evil.example/x'])assert.equal(validSubscription({...s.sub,endpoint}),false);
 const subscribed=await s.call('/notifications/subscribe',a.token,{id,platform:'web',subscription:s.sub});assert.equal(subscribed.status,200,JSON.stringify(subscribed.body));assert.ok(subscribed.body.revokeToken);
 assert.equal((await s.call('/notifications/subscribe',b.token,{id:crypto.randomUUID(),platform:'web',subscription:s.sub})).status,409);
 await s.call('/notifications/revoke',null,{id,token:'X'.repeat(43)});assert.ok(await s.DB.prepare('SELECT 1 FROM push_devices WHERE id=?').bind(id).first());
 await s.call('/notifications/revoke',null,{id,token:subscribed.body.revokeToken});assert.equal(await s.DB.prepare('SELECT 1 FROM push_devices WHERE id=?').bind(id).first(),null);
 }finally{s.DB.close();}
});
test('friend invite outbox is bounded, encrypted, respects blocks and removes revoked subscriptions',async()=>{
 const s=await setup(),original=globalThis.fetch;try{const [a,b]=s.users,id=crypto.randomUUID();await s.call('/notifications/subscribe',b.token,{id,platform:'web',subscription:s.sub});
 const f=await s.call('/friends',a.token,{code:b.user.code});await s.call('/friends/'+f.body.id,b.token,{accept:true},'PATCH');
 // A transient provider failure preserves the invite and queues bounded retry.
 globalThis.fetch=async(url,options)=>{assert.equal(url,s.sub.endpoint);assert.equal(options.redirect,'error');assert.equal(options.headers['content-encoding'],'aes128gcm');assert.ok(options.headers.authorization.startsWith('vapid '));assert.equal(options.body.length,4096);assert.ok(!Buffer.from(options.body).includes(Buffer.from('Alice invited')));return new Response(null,{status:503});};
 const invitation=await s.call('/invites',a.token,{target:b.user.id,code:'ABCDEFGHJKLMNPQR'});assert.equal(invitation.status,201);assert.equal((await s.DB.prepare('SELECT count(*) n FROM push_outbox').first()).n,1);
 await s.call('/blocks',b.token,{target:a.user.id});let sends=0;await dispatchPush(s.env,{send:async()=>{sends++;return{ok:true};}});assert.equal(sends,0);assert.equal((await s.DB.prepare('SELECT count(*) n FROM push_outbox').first()).n,0);
 const sent=await sendPush(s.env,{platform:'web',value:JSON.stringify(s.sub),invite_id:crypto.randomUUID(),name:'Alice',expires:Math.floor(Date.now()/1000)+600});assert.equal(sent.ok,false);
 globalThis.fetch=async()=>new Response(null,{status:410});assert.equal((await sendPush(s.env,{platform:'web',value:JSON.stringify(s.sub),invite_id:crypto.randomUUID(),name:'Alice',expires:Math.floor(Date.now()/1000)+600})).gone,true);
 await s.call('/auth/logout',b.token,{});assert.equal((await s.DB.prepare('SELECT count(*) n FROM push_devices').first()).n,0);
 }finally{globalThis.fetch=original;s.DB.close();}
});
test('FCM is unavailable without server credentials and invalid native tokens are refused',async()=>{
 const s=await setup();try{const [a]=s.users,config=await s.call('/notifications/config',a.token,null,'GET');assert.equal(config.body.androidPush,false);assert.equal(config.body.webPush,true);assert.equal((await s.call('/notifications/subscribe',a.token,{id:crypto.randomUUID(),platform:'android',token:'not-a-token'})).status,503);assert.ok(!JSON.stringify(config.body).includes(s.env.VAPID_PRIVATE_KEY));}finally{s.DB.close();}
});
test('native capability is constrained; notification taps use a stable activity only for supporting APKs',async()=>{
 const s=await setup(),original=globalThis.fetch;try{
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const pem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
  s.env.FCM_SERVICE_ACCOUNT=JSON.stringify({project_id:'test-project',client_email:'sender@test-project.iam.gserviceaccount.com',private_key:pem});
  const id=crypto.randomUUID(),token='testing-fcm-token'.repeat(3),a=s.users[0];
  assert.equal((await s.call('/notifications/subscribe',a.token,{id,platform:'android',token,launcherSafe:'arbitrary-action'})).status,400);
  assert.equal((await s.call('/notifications/subscribe',a.token,{id,platform:'web',subscription:s.sub,launcherSafe:true})).status,400);
  assert.equal((await s.call('/notifications/subscribe',a.token,{id,platform:'android',token,launcherSafe:true})).status,200);
  const stored=await s.DB.prepare('SELECT value FROM push_devices WHERE id=?').bind(id).first();assert.equal(JSON.parse(stored.value).launcherSafe,true);
  const messages=[];globalThis.fetch=async(url,options)=>{if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-oauth'});assert.match(url,/^https:\/\/fcm.googleapis.com/);messages.push(JSON.parse(options.body));return Response.json({name:'sent-test'});};
  const row={platform:'android',value:stored.value,invite_id:crypto.randomUUID(),name:'Alice',expires:Math.floor(Date.now()/1000)+600};
  assert.equal((await sendPush(s.env,row)).ok,true);assert.equal(messages[0].message.android.notification.click_action,'io.github.ppatsis.fingerfight.OPEN_INVITES');
  assert.equal((await sendPush(s.env,{...row,value:JSON.stringify({token})})).ok,true);assert.equal(messages[1].message.android.notification.click_action,undefined);
 }finally{globalThis.fetch=original;s.DB.close();}
});
