import test from 'node:test';
import assert from 'node:assert/strict';
import {startNativeSignIn,completeNativeSignIn,cancelNativeSignIn} from '../js/native-auth.js';
test('native sign-in keeps the verifier on the device and returns only a one-use code in the deep link',async()=>{
 const oldStorage=globalThis.localStorage,oldCap=globalThis.Capacitor,m=new Map(),handoff='h'.repeat(43),code='c'.repeat(43);globalThis.localStorage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};let opened,challenge,exchanged=0;
 globalThis.Capacitor={registerPlugin:name=>{assert.equal(name,'Browser');return{async open({url}){opened=url;}};}};
 const result={token:'session-bearer',user:{id:crypto.randomUUID(),registered:true}},api={base:'https://api.test',async request(path,method,data){if(path==='/auth/native/start'){challenge=data.challenge;return{handoff};}assert.equal(path,'/auth/native/exchange');assert.equal(data.code,code);assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.verifier))).toString('base64url'),challenge);exchanged++;return result;},save(value){this.user=value.user;return value;}};
 try{const pending=startNativeSignIn(api,'login');for(let i=0;!opened&&i<20;i++)await new Promise(r=>setImmediate(r));assert.ok(opened.endsWith('#handoff='+handoff));assert.ok(!opened.includes('verifier'));assert.ok(!opened.includes('session-bearer'));
 assert.equal(await completeNativeSignIn(api,'https://evil.example/account?handoff='+handoff+'&code='+code),false);
 assert.equal(await completeNativeSignIn(api,'fingerfight://account?handoff='+handoff+'&code='+code),true);assert.deepEqual(await pending,result);assert.equal(exchanged,1);assert.equal(await completeNativeSignIn(api,'fingerfight://account?handoff='+handoff+'&code='+code),false);
 }finally{cancelNativeSignIn();globalThis.localStorage=oldStorage;globalThis.Capacitor=oldCap;}
});

test('native login recovers an expired cached guest session before opening the browser',async()=>{
 const oldStorage=globalThis.localStorage,oldCap=globalThis.Capacitor,m=new Map(),handoff='h'.repeat(43),code='c'.repeat(43);globalThis.localStorage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};let opened=false,renewed=false;
 m.set('ff-session:https://api.test',JSON.stringify({token:'expired',user:{id:crypto.randomUUID(),registered:false}}));
 globalThis.Capacitor={isNativePlatform:()=>true,registerPlugin:()=>({async open(){opened=true;}})};
 const {Service}=await import('../js/service.js'),api=new Service('https://api.test');api.request=async path=>{
  if(path==='/me'){const e=new Error('Expired');e.status=401;throw e;}
  if(path==='/players/session'){renewed=true;return{token:'new-guest',user:{id:crypto.randomUUID(),registered:false}};}
  if(path==='/auth/native/start'){assert.equal(api.token,'new-guest');return{handoff};}
  if(path==='/auth/native/exchange')return{token:'account-session',user:{id:crypto.randomUUID(),registered:true}};
  throw new Error(path);
 };
 try{const pending=api.login();for(let i=0;!opened&&i<20;i++)await new Promise(r=>setImmediate(r));assert.equal(renewed,true);assert.equal(opened,true);await completeNativeSignIn(api,'fingerfight://account?handoff='+handoff+'&code='+code);await pending;assert.equal(api.user.registered,true);}finally{cancelNativeSignIn();globalThis.localStorage=oldStorage;globalThis.Capacitor=oldCap;}
});

test('a cancelled exchange cannot sign the app back in or overwrite a newer sign-in',async()=>{
 const oldStorage=globalThis.localStorage,m=new Map(),handoff='h'.repeat(43);globalThis.localStorage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};m.set('ff-native-signin',JSON.stringify({base:'https://api.test',handoff,verifier:'v'.repeat(43),at:Date.now()}));let finish,revoked=false,saved=false;
 const api={base:'https://api.test',request(path,method,data,options){if(path==='/auth/native/exchange')return new Promise(r=>finish=r);assert.equal(options.token,'unused-session');revoked=true;return Promise.resolve();},save(){saved=true;}};
 try{const completing=completeNativeSignIn(api,'fingerfight://account?handoff='+handoff+'&code='+'c'.repeat(43));cancelNativeSignIn();finish({token:'unused-session',user:{registered:true}});assert.equal(await completing,false);assert.equal(saved,false);assert.equal(revoked,true);}finally{cancelNativeSignIn();globalThis.localStorage=oldStorage;}
});

test('web Google sign-in reserves a popup on click and accepts only its Worker-origin completion',async()=>{
 const old={storage:globalThis.sessionStorage,open:globalThis.open,add:globalThis.addEventListener,remove:globalThis.removeEventListener,cap:globalThis.Capacitor};const data=new Map(),handoff='h'.repeat(43),code='c'.repeat(43);let listener,opened=false,exchanged=0,closed=false;
 const popup={location:{href:''},close(){closed=true;}},result={token:'new-session',user:{id:'google-user',registered:true,google:true}};
 globalThis.Capacitor={isNativePlatform:()=>false};globalThis.sessionStorage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};globalThis.open=()=>{opened=true;return popup;};globalThis.addEventListener=(type,fn)=>{assert.equal(type,'message');listener=fn;};globalThis.removeEventListener=()=>{};
 const api={base:'https://api.test',async ensurePlayer(){assert.equal(opened,true);},async request(path,method,body){if(path==='/auth/google/start'){assert.equal(body.platform,'web');assert.equal(body.action,'signin');return{handoff};}assert.equal(path,'/auth/google/exchange');exchanged++;return result;},save(r){this.user=r.user;return r;}};
 try{const pending=startNativeSignIn(api,'google');assert.equal(opened,true);for(let i=0;!listener&&i<20;i++)await new Promise(r=>setImmediate(r));assert.equal(popup.location.href,'https://api.test/auth/google#handoff='+handoff);const event={origin:'https://evil.test',source:popup,data:{type:'fingerfight-auth',url:'fingerfight://account?handoff='+handoff+'&code='+code}};listener(event);listener({...event,origin:'https://api.test',source:{}});assert.equal(exchanged,0);listener({...event,origin:'https://api.test'});assert.deepEqual(await pending,result);assert.equal(exchanged,1);assert.equal(closed,true);}finally{cancelNativeSignIn();globalThis.sessionStorage=old.storage;globalThis.open=old.open;globalThis.addEventListener=old.add;globalThis.removeEventListener=old.remove;globalThis.Capacitor=old.cap;}
});
