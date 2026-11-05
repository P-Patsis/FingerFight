import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser,FakePeer,until} from './harness.js';
const b=installBrowser('?sim=1'),$=id=>b.byId.get(id);
await import('../js/main.js');
const {DEFAULTS}=await import('../js/logic.js');
test('new match has two lives and announces each finger reduction prominently on both-player round messages',async()=>{
 let conn;const host=new FakePeer('ffight-p-ABCDEFGHJKLMNPQR');
 host.on('connection',c=>{conn=c;c.on('data',m=>{if(m.t==='hello')c.send({t:'welcome',v:2,kind:'private',name:'Host',settings:DEFAULTS,ready:true});});});
 $('codeInput').value='ABCD-EFGH-JKLM-NPQR';await $('joinBtn').onclick();await until(()=>$('nameHost').textContent==='Host','welcome');
 assert.equal($('valHits').textContent,'2');assert.equal($('valMax').textContent,'5');assert.equal($('shrinkBtn').textContent,'On');
 conn.send({t:'start',settings:DEFAULTS});await until(()=>b.visible()[0]==='game','game');assert.equal($('topHp').children.length,2);assert.equal($('botHp').children.length,2);
 for(let n=1;n<=10;n++){
  conn.send({t:'round',n});await until(()=>$('roundLabel').textContent==='ROUND '+n&&$('banner').children[0]?.textContent!=='GET READY','round '+n);
  const primary=$('banner').children[0].textContent;
  if([5,7,9].includes(n)){assert.equal(primary,'Fingers reduced to '+(6-Math.floor(n/2)));assert.equal($('banner').children[1].textContent,'ROUND '+n);}
  else assert.equal(primary,'ROUND '+n,'no reduction notice between reductions');
 }
 await until(()=>$('bottomContent').querySelectorAll('[data-count]').length===2,'minimum controls');assert.deepEqual($('bottomContent').querySelectorAll('[data-count]').map(b=>Number(b.dataset.count)),[1,2]);
 $('leaveBtn').onclick();await until(()=>b.visible()[0]==='menu','leave');
});
