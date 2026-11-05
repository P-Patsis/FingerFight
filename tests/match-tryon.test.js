import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser,until} from './harness.js';
const b=installBrowser('?'),$=id=>b.byId.get(id);
const {HandCam}=await import('../js/hands.js');let camera,starts=0;
HandCam.prototype.load=async function(){camera=this;};
HandCam.prototype.startCamera=async function(){starts++;this.stream={getTracks:()=>[{stop(){}}]};return null;};
HandCam.prototype.run=function(){this.running=true;};
await import('../js/main.js');
test('between-match try-on releases its camera and the next round restores match camera safety hooks',async()=>{
 await $('computerBtn').onclick();await until(()=>!$('startBtn').disabled,'ready');$('custBtn').onclick();$('tryNow').onclick();await until(()=>camera.running&&$('camBox').parentElement===$('liveBox'),'try on');
 assert.equal($('camLive').hidden,false);$('custDone').onclick();assert.equal(b.visible()[0],'lobby');assert.equal(camera.stream,null);assert.equal($('camLive').hidden,true);
 $('startBtn').onclick();await until(()=>starts===3&&camera.running,'round camera',7000);camera.onLost();assert.equal($('banner').children[0].textContent,'CAMERA STOPPED','round uses match hooks instead of stale try-on handlers');
 $('leaveBtn').onclick();assert.equal(b.visible()[0],'menu');assert.equal(camera.stream,null);
});
