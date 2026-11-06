import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openDB} from '../sqlite.mjs';
import {createApp} from '../worker.mjs';
import {Service} from '../../js/service.js';
import {Matchmaker} from '../../js/matchmaking.js';
import {Link,newToken} from '../../js/net.js';
import {installBrowser,until,sleep,network} from '../../tests/harness.js';
// Enable the configured-backend branch without publishing a nonexistent production API URL.
for(const first of ['controller','opponent'])test('game controller uses the shared queue with '+first+' searching first',async()=>{
 const browser=installBrowser('?sim=1'),DB=openDB();
 globalThis.Capacitor={isNativePlatform:()=>first==='controller'};DB.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));const app=createApp(),env={DB,ALLOWED_ORIGINS:'https://localhost',TURN_SERVERS_JSON:JSON.stringify([{urls:'turn:test.invalid:3478',username:'test',credential:'temporary'}])};
 const enabled=Object.getOwnPropertyDescriptor(Service.prototype,'enabled'),request=Service.prototype.request;
 Object.defineProperty(Service.prototype,'enabled',{get:()=>true,configurable:true});
 Service.prototype.request=async function(path,method='GET',data){const r=await app.fetch(new Request('https://api.test'+path,{method,headers:{Origin:'https://localhost','Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})}),env);const result=await r.json();if(!r.ok){const e=new Error(result.error);e.status=r.status;throw e;}return result;};
 let opponent,otherLink,pair;const got=[];
 try{
  await import('../../js/main.js?queue-controller-'+first);
  const mine=first==='controller'?browser.byId.get('randomBtn').onclick():null;
  if(mine)await until(()=>network.size===1,'controller registers first',5000);
  assert.equal(browser.byId.get('accountBtn').hidden,first==='controller','native guest matching does not enable unconfigured native passkeys');
  const service=new Service('https://api.test');opponent=new Matchmaker(service,{pollMs:100});
  const other=opponent.start('Other player',{
   openPeer:async (id,iceServers)=>{otherLink=new Link({onOpen:()=>{if(pair?.role==='guest')otherLink.send({t:'hello',v:2,kind:'random',name:'Other player',token:otherLink.token,pair:otherLink.pairProof()});},onMessage:m=>{got.push(m);if(m.t==='hello'){otherLink.setToken(m.token);otherLink.send({t:'welcome',v:2,kind:'random',name:'Other player',yourName:m.name,settings:{},ready:false,pair:otherLink.pairProof()});}}},{relay:true,iceServers});await otherLink.host(id);},
   onPair:p=>{pair=p;otherLink.expectPair(p);if(p.role==='guest')otherLink.setToken(newToken());},
   connect:async p=>{if(p.role==='guest')await otherLink.dialRegistered(p.hostPeer);await until(()=>got.some(m=>['hello','welcome'].includes(m.t)),'peer handshake',5000);},
  });
  if(!mine)await until(()=>network.size===1,'opponent registers first',5000);
  await Promise.all([mine||browser.byId.get('randomBtn').onclick(),other]);
  assert.ok(browser.visible().includes('lobby'),browser.byId.get('menuMsg').textContent);
  assert.equal(pair.role,first==='controller'?'guest':'host');
  assert.equal(network.size,2);assert.ok([...network.keys()].every(id=>id.startsWith('ffight-q-')));
  assert.equal(browser.byId.get('cancelBtn').hidden,true);
  // The cancel control resets the controller and releases the assignment on both sides.
  browser.byId.get('cancelBtn').onclick();await sleep(30);
  assert.equal((await DB.prepare('SELECT count(*) n FROM queue_tickets').first()).n,0);
 }finally{await opponent?.cancel();otherLink?.close();network.clear();Object.defineProperty(Service.prototype,'enabled',enabled);Service.prototype.request=request;delete globalThis.Capacitor;DB.close();}
});
