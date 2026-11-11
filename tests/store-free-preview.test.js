import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser,until} from './harness.js';
import {HandCam} from '../js/hands.js';
const b=installBrowser('?'),$=id=>b.byId.get(id);let camera;
globalThis.Path2D=class{constructor(d){this.d=d;}};
HandCam.prototype.load=async function(){camera=this;};HandCam.prototype.startCamera=async function(){this.stream={getTracks:()=>[{stop(){},readyState:'live'}]};return null;};HandCam.prototype.run=function(){this.running=true;};
await import('../js/main.js');
test('locked items preview and try on without equipping/granting; camera and restored contexts repaint item art',async()=>{
 $('storeBtn').onclick();await until(()=>$('storeGrid').children.some(c=>c.dataset.id==='flaming'),'locked store cards');
 const before=['ff-puppet','ff-stack','ff-owned'].map(k=>localStorage.getItem(k)),card=$('storeGrid').children.find(c=>c.dataset.id==='flaming'),canvas=card.children.find(c=>c.tagName==='CANVAS');
 let fills=0,contextOptions;const old=canvas.getContext.bind(canvas);canvas.getContext=(type,opts)=>{contextOptions=opts;const ctx=old(type);return new Proxy({fill:()=>{fills++;}},{get:(t,k)=>k in t?t[k]:ctx[k]});};
 card.children.find(c=>c.dataset.act==='preview').onclick();assert.match($('storeMsg').textContent,/Previewing/);assert.deepEqual(['ff-puppet','ff-stack','ff-owned'].map(k=>localStorage.getItem(k)),before);
 await $('storeSnap').onclick();assert.equal(camera.overlay.skin,'flaming');assert.ok(fills>0,'item paths redraw when camera starts');assert.equal(contextOptions.willReadFrequently,true);
 const count=fills;canvas.fire('contextrestored');assert.ok(fills>count,'a restored context repaints its item');$('wearCamOff').onclick();assert.equal(camera.stream,null);
 await card.children.find(c=>c.dataset.act==='unlock').onclick();assert.match($('storeMsg').textContent,/not available yet/);assert.deepEqual(['ff-puppet','ff-stack','ff-owned'].map(k=>localStorage.getItem(k)),before,'no pretend reward or purchase');
 $('storeCustomise').onclick();assert.notEqual($('storeGrid').hidden,true);assert.ok(!$('profileGrid').children.some(c=>c.dataset.id==='flaming'),'preview never adds an unowned item to equipment');$('profileBack').onclick();
});
