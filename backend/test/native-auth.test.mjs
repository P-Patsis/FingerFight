import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openDB} from '../sqlite.mjs';
import {createApp} from '../worker.mjs';
import {authenticator} from './authenticator.mjs';
const origin='https://p-patsis.github.io';
async function setup(){const DB=openDB();DB.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const app=createApp(),env={DB,ALLOWED_ORIGINS:origin+',https://localhost',APP_ORIGIN:origin,RP_ID:'p-patsis.github.io'};
 const call=async(path,data={},token=null,from='https://localhost')=>{const r=await app.fetch(new Request('https://api.test'+path,{method:'POST',headers:{Origin:from,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)}),env);return{status:r.status,body:await r.json()};};
 const guest=(await call('/players/session',{name:'Native Alice'})).body;const verifier=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');return{DB,call,guest,verifier,challenge};}
test('native browser registration returns a PKCE grant, not a bearer, and exchanges once on the original device',async()=>{
 const s=await setup();try{const a=await authenticator(),start=await s.call('/auth/native/start',{action:'register',challenge:s.challenge},s.guest.token);assert.equal(start.status,200);const handoff=start.body.handoff;
 const options=await s.call('/auth/native/options',{handoff},null,origin);assert.equal(options.body.action,'register');
 const verified=await s.call('/auth/native/verify',{handoff,id:options.body.id,response:await a.register(options.body.options.challenge)},null,origin);assert.equal(verified.status,200,JSON.stringify(verified.body));assert.ok(!verified.body.token);assert.ok(verified.body.code);
 assert.equal((await s.call('/auth/native/exchange',{handoff,code:verified.body.code,verifier:'X'.repeat(43)})).status,401);
 const exchanged=await s.call('/auth/native/exchange',{handoff,code:verified.body.code,verifier:s.verifier});assert.equal(exchanged.status,200);assert.equal(exchanged.body.user.id,s.guest.user.id);assert.equal(exchanged.body.user.registered,true);
 assert.equal((await s.call('/auth/native/exchange',{handoff,code:verified.body.code,verifier:s.verifier})).status,401);
 const again=await s.call('/auth/native/start',{action:'login',challenge:s.challenge},exchanged.body.token);const login=await s.call('/auth/native/options',{handoff:again.body.handoff},null,origin);
 const signed=await s.call('/auth/native/verify',{handoff:again.body.handoff,id:login.body.id,response:await a.login(login.body.options.challenge)},null,origin);assert.equal(signed.status,200);
 const restored=await s.call('/auth/native/exchange',{handoff:again.body.handoff,code:signed.body.code,verifier:s.verifier});assert.equal(restored.body.user.id,s.guest.user.id);
 }finally{s.DB.close();}
});
test('native auth rejects forged passkey origins, expired handoffs and caller-controlled redirect URLs',async()=>{
 const s=await setup();try{
 assert.equal((await s.call('/auth/native/start',{action:'login',challenge:s.challenge,redirect:'https://evil.example'},s.guest.token)).status,400);
 const started=await s.call('/auth/native/start',{action:'register',challenge:s.challenge},s.guest.token),handoff=started.body.handoff,options=await s.call('/auth/native/options',{handoff},null,origin),evil=await authenticator('p-patsis.github.io','https://evil.example');
 assert.equal((await s.call('/auth/native/verify',{handoff,id:options.body.id,response:await evil.register(options.body.options.challenge)},null,origin)).status,401);
 await s.DB.prepare('UPDATE native_handoffs SET expires=0').run();assert.equal((await s.call('/auth/native/options',{handoff},null,origin)).status,401);
 }finally{s.DB.close();}
});

test('signing out invalidates a pending native browser handoff',async()=>{
 const s=await setup();try{const start=await s.call('/auth/native/start',{action:'login',challenge:s.challenge},s.guest.token);assert.equal(start.status,200);assert.equal((await s.call('/auth/logout',{},s.guest.token)).status,200);assert.equal((await s.call('/auth/native/options',{handoff:start.body.handoff},null,origin)).status,401);}finally{s.DB.close();}
});
