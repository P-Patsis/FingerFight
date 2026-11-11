import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser,until} from './harness.js';
const b=installBrowser('?sim=1'),$=id=>b.byId.get(id);
localStorage.setItem('ff-owned',JSON.stringify(['flaming','ornate']));localStorage.setItem('ff-puppet','flaming');localStorage.setItem('ff-stack',JSON.stringify([{id:'ornate'}]));
localStorage.setItem('ff-name','Keep my name');localStorage.setItem('ff-looks','[]');localStorage.setItem('ff-stats','{"m":5}');
await import('../js/main.js');
test('prototype Store reset cancels safely or revokes local grants without clearing profile/stats/looks',async()=>{
 $('storeBtn').onclick();await until(()=>!$('storeGrid').children.some(c=>c.dataset.id==='flaming'),'owned items absent');assert.equal($('storeDevTools').hidden,false);
 globalThis.confirm=()=>false;$('storeReset').onclick();assert.ok(JSON.parse(localStorage.getItem('ff-owned')).includes('flaming'));
 globalThis.confirm=()=>true;$('storeReset').onclick();assert.deepEqual(JSON.parse(localStorage.getItem('ff-owned')),[]);assert.equal(localStorage.getItem('ff-puppet'),'cartoon');assert.deepEqual(JSON.parse(localStorage.getItem('ff-stack')),[]);
 assert.ok($('storeGrid').children.some(c=>c.dataset.id==='flaming'));assert.match($('storeMsg').textContent,/reset/);
 assert.equal(localStorage.getItem('ff-name'),'Keep my name');assert.equal(localStorage.getItem('ff-looks'),'[]');assert.equal(localStorage.getItem('ff-stats'),'{"m":5}');
});
