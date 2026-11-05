import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser,peers,until} from './harness.js';
const b=installBrowser('?sim=1'),$=id=>b.byId.get(id);
await import('../js/main.js');
test('computer match is local, supports lobby/result customisation, rematch and separate practice stats',async()=>{
 const rnd=Math.random;try{Math.random=()=>0;await $('computerBtn').onclick();}finally{Math.random=rnd;}
 await until(()=>!$('startBtn').disabled,'computer lobby ready');assert.equal(peers.length,0,'no signaling peer');assert.equal($('nameGuest').textContent,'Computer');
 $('lobbyCustomise').onclick();assert.equal(b.visible()[0],'profile');assert.equal($('custArea').hidden,false);const chosen=$('profileGrid').children.find(c=>c.dataset.id==='neon');assert.ok(chosen);chosen.onclick();$('startBtn').onclick();assert.equal(b.visible()[0],'profile','cannot start while editing');
 $('custDone').onclick();assert.equal(b.visible()[0],'lobby');assert.equal($('startBtn').disabled,false);
 const step=k=>$('settingsCard').fire('click',{target:{closest:()=>({dataset:{step:k}})}});step('hits:-1');step('seconds:-1');step('seconds:-1');$('startBtn').onclick();
 await until(()=>b.visible()[0]==='over','computer game ends normally',20000);assert.ok($('collage').children.length>0);assert.equal($('overTitle').textContent,'YOU LOSE');assert.equal(peers.length,0);
 assert.equal(JSON.parse(localStorage.getItem('ff-practice-stats')).l,1);assert.equal(localStorage.getItem('ff-stats'),null,'practice does not count as a player loss');
 $('overCustomise').onclick();assert.equal(b.visible()[0],'profile');$('profileBack').onclick();assert.equal(b.visible()[0],'over');assert.ok($('collage').children.length>0,'existing result carousel retained');
 $('settingsBtn').onclick();assert.equal(b.visible()[0],'lobby');assert.equal($('nameGuest').textContent,'Computer');assert.equal($('startBtn').disabled,false,'computer stays ready between matches');
 $('startBtn').onclick();assert.equal(b.visible()[0],'game');$('leaveBtn').onclick();assert.equal(b.visible()[0],'menu');assert.equal(peers.length,0);
});
