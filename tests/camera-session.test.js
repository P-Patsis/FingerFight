import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser} from './harness.js';
import {makeHand,ALL} from './helpers.js';
import {HandCam} from '../js/hands.js';
import {drawPlan} from '../js/puppet.js';
test('concurrent camera preparation and try-on load only one tracking model',async()=>{
 const b=installBrowser('?'),video=b.byId.get('video'),canvas=b.byId.get('overlayCanvas');let imports=0,models=0;
 const model={detectForVideo:()=>({landmarks:[]})};
 const cam=new HandCam(video,canvas,{loadVision:async()=>{imports++;await new Promise(r=>setTimeout(r,5));return{FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:async()=>{models++;return model;}}};}});
 await Promise.all([cam.load(),cam.load(),cam.load()]);await cam.load();assert.equal(imports,1);assert.equal(models,1);assert.equal(cam.landmarker,model);
});
test('stale tracking callbacks cannot restart after try-on is released and match camera restarts',()=>{
 const b=installBrowser('?'),video=b.byId.get('video'),canvas=b.byId.get('overlayCanvas'),frames=[];const raf=globalThis.requestAnimationFrame;
 globalThis.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};Object.assign(video,{readyState:4,videoWidth:640,videoHeight:480,currentTime:0});
 const cam=new HandCam(video,canvas);let detects=0;cam.landmarker={detectForVideo:()=>{detects++;return{landmarks:[makeHand(ALL)]};}};
 try{cam.run();assert.equal(detects,1);const old=frames.shift();cam.release();video.currentTime=1;cam.run();assert.equal(detects,2);const current=frames.shift();video.currentTime=2;old();assert.equal(detects,2);assert.equal(frames.length,0,'old loop schedules nothing');current();assert.equal(detects,3);assert.equal(cam.snap({mode:'puppet',skin:'cartoon',stack:[]}).count,5);}
 finally{cam.release();globalThis.requestAnimationFrame=raf;}
});
test('a failed puppet path restores its canvas before fallback/next rendering',()=>{
 const path=globalThis.Path2D;globalThis.Path2D=class{constructor(){throw new Error('lost drawing context');}};let depth=0;
 const ctx={save(){depth++;},restore(){depth--;},setTransform(){}};
 try{assert.throws(()=>drawPlan(ctx,[{m:[1,0,0,1,0,0],shapes:[{d:'M0 0',opacity:1}]}]),/lost drawing context/);assert.equal(depth,0);}finally{globalThis.Path2D=path;}
});
