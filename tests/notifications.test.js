import test from 'node:test';
import assert from 'node:assert/strict';
import {InviteNotifications} from '../js/notifications.js';
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
function fixture(permission='granted'){
 let active=null;const calls=[],sub={toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'key',auth:'key'}}),async unsubscribe(){calls.push('unsubscribe');active=null;return true;}},api={base:'https://api.test',user:{id:crypto.randomUUID(),registered:true},async request(path,method,data){calls.push({path,method,data});if(path==='/notifications/config')return{webPush:true,webPushPublicKey:Buffer.alloc(65,4).toString('base64url'),androidPush:false};if(path==='/notifications/subscribe')return{id:data.id,revokeToken:'r'.repeat(43)};return{ok:true};}},notification={permission,async requestPermission(){calls.push('permission');return permission;}},serviceWorker={addEventListener(){},ready:Promise.resolve({pushManager:{async getSubscription(){return active;},async subscribe(options){calls.push({subscribe:options});active=sub;return sub;}}})};
 return{calls,api,notification,serviceWorker,storage:storage()};
}
test('loading invite settings never asks permission; explicit opt-in registers and opt-out revokes the device',async()=>{
 const original=globalThis.PushManager;globalThis.PushManager=class{};try{const f=fixture(),n=new InviteNotifications(f.api,{...f,native:false});assert.equal(n.enabled,false);await n.load();assert.ok(!f.calls.includes('permission'));await n.enable();assert.equal(n.enabled,true);assert.equal(f.calls.filter(x=>x==='permission').length,1);assert.ok(f.calls.some(x=>x.path==='/notifications/subscribe'));await n.disable();assert.equal(n.enabled,false);assert.ok(f.calls.some(x=>x.path==='/notifications/revoke'));assert.ok(f.calls.includes('unsubscribe'));}finally{globalThis.PushManager=original;}
});
test('denied permission and missing device identity cannot create a push subscription',async()=>{
 const original=globalThis.PushManager;globalThis.PushManager=class{};try{const f=fixture('denied'),n=new InviteNotifications(f.api,{...f,native:false});await n.load();await assert.rejects(()=>n.enable(),/blocked/);assert.ok(!f.calls.some(x=>x.path==='/notifications/subscribe'));f.api.user=null;await assert.rejects(()=>n.enable(),/Open Friends/);}finally{globalThis.PushManager=original;}
});
test('pending revocation can finish after logout without retaining an account bearer token',async()=>{
 const f=fixture();f.api.user=null;const n=new InviteNotifications(f.api,{...f,native:false});n.save({owner:'old-account',id:crypto.randomUUID(),revokeToken:'r'.repeat(43),enabled:false,pendingDisable:true});await n.sync();assert.ok(f.calls.some(x=>x.path==='/notifications/revoke'));assert.equal(n.state().pendingDisable,false);
});
test('unsupported native push remains unavailable and never calls registration',async()=>{
 let unregisters=0;const f=fixture(),plugin={addListener(){return Promise.resolve({remove(){}});},requestPermissions(){throw new Error('must not prompt');},unregister(){unregisters++;}};const n=new InviteNotifications(f.api,{...f,native:true,plugin,serviceWorker:{ready:new Promise(()=>{})},nativeConfigured:()=>false});await n.load();assert.equal(n.available,false);await assert.rejects(()=>n.enable(),/not available/);await n.disable();assert.equal(unregisters,0);assert.equal(n.state().pendingDisable,false);
});
test('native opt-in advertises the stable notification route without changing permission behavior',async()=>{
 const f=fixture();let listeners={},prompts=0,unregistered=0;
 const plugin={async addListener(name,fn){listeners[name]=fn;return{remove(){delete listeners[name];}};},async requestPermissions(){prompts++;return{receive:'granted'};},async createChannel(){},async register(){listeners.registration({value:'native-token'});},async unregister(){unregistered++;}};
 const n=new InviteNotifications(f.api,{...f,native:true,plugin,nativeConfigured:()=>true});n.capabilities={androidPush:true};
 await n.enable();assert.equal(prompts,1);assert.equal(f.calls.find(c=>c.path==='/notifications/subscribe').data.launcherSafe,true);await n.disable();assert.equal(unregistered,1);
});
test('switching identity revokes the old device opt-in without prompting the new profile',async()=>{const f=fixture(),n=new InviteNotifications(f.api,{...f,native:false});n.save({owner:'previous-profile',id:crypto.randomUUID(),revokeToken:'r'.repeat(43),enabled:true});await n.sync();assert.equal(n.state().enabled,false);assert.ok(f.calls.some(c=>c.path==='/notifications/revoke'));assert.ok(!f.calls.includes('permission'));});
