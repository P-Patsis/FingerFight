import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until, peers } from './harness.js';
import { makeHand, ALL, FAN } from './helpers.js';
const b=installBrowser('?'), $=id=>b.byId.get(id);
const {HandCam}=await import('../js/hands.js');
let camera;
HandCam.prototype.load=async function(){camera=this;};
HandCam.prototype.startCamera=async function(){this.video.videoWidth=640;this.video.videoHeight=480;this.stream={getTracks:()=>[{readyState:'live',stop(){}}]};return null;};
HandCam.prototype.run=function(){this.running=true;this.samples=[{has:true,count:5,gesture:null,hands:[makeHand(ALL,FAN)]}];};
await import('../js/main.js');
const image=n=>n.tagName==='IMG'?n:(n.children||[]).map(image).find(Boolean);
test('computer practice offers both camera views, uses real overlay paths and displays a local camera snapshot',async()=>{
 $('profileBtn').onclick();$('photoBtn').onclick();$('profileBack').onclick(); // An earlier opponent-photo preference must not hide my own practice photo.
 await $('computerBtn').onclick();await until(()=>!$('startBtn').disabled,'camera ready');
 try {
 const choose=mode=>$('modePicker').children.find(c=>c.dataset.mode===mode);
 assert.ok($('modePicker').children.every(c=>!c.hidden),'all four view choices offered');
 $('custBtn').onclick();await $('tryNow').onclick();
 for(const mode of ['photo-puppet','photo-skeleton','puppet','skeleton']){
  choose(mode).onclick();
  assert.equal(camera.overlay.puppet,mode.endsWith('puppet'));
  assert.equal($('video').classList.contains('feed-hidden'),!mode.startsWith('photo-'));
 }
 choose('photo-skeleton').onclick();
 assert.match($('styleNote').textContent,/In random matches, no camera photo is stored or sent/);
 assert.doesNotMatch($('styleNote').textContent,/Computer practice|Warning:/);
 $('custDone').onclick();await until(()=>!$('startBtn').disabled,'ready after try-on');
 const step=k=>$('settingsCard').fire('click',{target:{closest:()=>({dataset:{step:k}})}});
 step('seconds:-1');step('seconds:-1');$('startBtn').onclick();
 await until(()=>image($('bottomContent')),'own camera snapshot in practice',15000);
 assert.equal(image($('bottomContent')).src,'data:image/jpeg;base64,AAAA');
 assert.equal(peers.length,0,'local picture never needs a signaling peer');
 } finally { if(b.visible()[0]==='profile')$('custDone').onclick(); $('leaveBtn').onclick(); }
});
