import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../worker.mjs';
import {relayConfig} from '../matchmaking.mjs';
import {openDB} from '../sqlite.mjs';
import {Service} from '../../js/service.js';
import {installBrowser,until,network} from '../../tests/harness.js';

test('private controller obtains a managed relay before creating PeerJS; failures and cancelled preparation do not open stale rooms',async()=>{
 const b=installBrowser('?sim=1'),$=id=>b.byId.get(id),DB=openDB();DB.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const app=createApp({relay:relayConfig}),env={DB,ALLOWED_ORIGINS:'https://localhost',TURN_SERVERS_JSON:JSON.stringify([{urls:'turns:managed.invalid:443',username:'private-temp',credential:'temporary'}])};
 const enabled=Object.getOwnPropertyDescriptor(Service.prototype,'enabled'),old=Service.prototype.request;let fail=false,gate=null,entered=false;
 Object.defineProperty(Service.prototype,'enabled',{get:()=>true,configurable:true});
 Service.prototype.request=async function(path,method='GET',data){if(path==='/rtc/config'){entered=true;if(gate)await gate;if(fail){const e=new Error('Online play paused: relay allowance reached.');e.status=503;throw e;}}
 const r=await app.fetch(new Request('https://api.test'+path,{method,headers:{Origin:'https://localhost','Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})}),env);const value=await r.json();if(!r.ok){const e=new Error(value.error);e.status=r.status;throw e;}return value;};
 try{
  await import('../../js/main.js?managed-private');await $('createBtn').onclick();assert.equal(network.size,1);const host=[...network.values()][0];assert.ok(host.options.config.iceServers.some(s=>s.username==='private-temp'));assert.equal(host.options.config.iceTransportPolicy,undefined,'private can connect directly');$('leaveBtn').onclick();assert.equal(network.size,0);
  // Expire only this test Service's cache so each subsequent attempt exercises the endpoint.
  const prepare=Service.prototype.prepareRelay;Service.prototype.prepareRelay=async function(){this.relayUntil=0;return prepare.call(this);};
  try{fail=true;await $('createBtn').onclick();assert.equal(network.size,0);assert.match($('menuMsg').textContent,/relay allowance reached/);fail=false;
   let release;gate=new Promise(r=>release=r);entered=false;const pending=$('createBtn').onclick();await until(()=>entered,'relay preparation');await $('computerBtn').onclick();release();await pending;assert.equal(network.size,0,'cancelled private attempt cannot register a peer after switching mode');assert.equal($('nameGuest').textContent,'Computer');$('leaveBtn').onclick();
  }finally{Service.prototype.prepareRelay=prepare;}
 }finally{Service.prototype.request=old;Object.defineProperty(Service.prototype,'enabled',enabled);DB.close();}
});
