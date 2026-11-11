import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser,until,peers,Conn} from './harness.js';
const b=installBrowser('?sim=1'),$=id=>b.byId.get(id),listeners={};document.addEventListener=(name,fn)=>(listeners[name]||=[]).push(fn);let clock=1000000;const originalNow=Date.now;Date.now=()=>clock;
const visible=hidden=>{document.hidden=hidden;for(const fn of listeners.visibilitychange||[])fn();};
await import('../js/main.js');
test('camera preparation does not start P2P; hiding locks fingers; peer requests advance background host; menu exposes forfeit',async()=>{
 try{await $('createBtn').onclick();const p=peers.find(p=>p.id?.startsWith('ffight-p-')),c=new Conn();p.emit('connection',c);c.emit('open');c.emit('data',{t:'hello',v:2,kind:'private',name:'Friend'});$('acceptBtn').onclick();await until(()=>!$('startBtn').disabled,'camera prepared');
  c.emit('data',{t:'ready',ready:true});assert.equal(b.visible()[0],'lobby');assert.ok(!c.sent.some(m=>m.t==='start'));$('startBtn').onclick();assert.equal(b.visible()[0],'game');
  clock+=1600;visible(false);assert.ok(c.sent.some(m=>m.t==='round'&&m.n===1));clock+=1900;visible(false);
  const count=$('bottomContent').querySelectorAll('[data-count]').find(b=>b.dataset.count==='3');assert.ok(count);count.onclick();
  $('gameMenuBtn').onclick();assert.equal($('gameMenu').hidden,false);$('gameResume').onclick();assert.equal($('gameMenu').hidden,true);
  visible(true);const sent=c.sent.find(m=>m.t==='reveal');assert.equal(sent.count,3,'tab switch locks the current count');
  c.emit('data',{t:'guess',n:1,guess:2,view:'puppet',skin:'cartoon',photo:'',hands:[{thumb:false,index:true,middle:true,ring:false,pinky:false}],lm:null,ar:1.333});
  c.emit('data',{t:'advance',n:2});assert.equal(c.sent.filter(m=>m.t==='round').at(-1).n,2,'background-host progress uses the peer data event rather than waiting for the throttled timer');
  visible(false);$('gameMenuBtn').onclick();$('gameForfeit').onclick();assert.equal(b.visible()[0],'menu');assert.ok(c.sent.some(m=>m.t==='forfeit'));assert.equal(JSON.parse(localStorage.getItem('ff-stats')).l,1);
 }finally{Date.now=originalNow;}
});
