import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser,peers,Conn,until} from './harness.js';
const b=installBrowser('?sim=1'),$=id=>b.byId.get(id);
await import('../js/main.js');
test('private lobby customisation preserves the room, signals not-ready while editing, then restores readiness',async()=>{
 await $('createBtn').onclick();const host=peers.find(p=>p.id?.startsWith('ffight-p-')),c=new Conn();host.emit('connection',c);c.emit('open');c.emit('data',{t:'hello',v:2,kind:'private',name:'Friend'});$('acceptBtn').onclick();c.emit('data',{t:'ready',ready:true});await until(()=>!$('startBtn').disabled,'ready');
 $('lobbyCustomise').onclick();assert.equal(b.visible()[0],'profile');assert.equal(c.sent.filter(m=>m.t==='ready').at(-1).ready,false);assert.equal(c.open,true);
 $('profileBack').onclick();assert.equal(b.visible()[0],'lobby');assert.equal(c.sent.filter(m=>m.t==='ready').at(-1).ready,true);assert.equal($('nameGuest').textContent,'Friend');assert.equal($('startBtn').disabled,false);assert.equal(c.open,true);
 c.emit('data',{t:'ready',ready:false});$('startBtn').onclick();assert.equal(b.visible()[0],'lobby','host cannot start while the other player edits');
 $('leaveBtn').onclick();
});
