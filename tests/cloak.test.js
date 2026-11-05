import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../js/vanish-engine.js';
import {CloakRenderer,cloakPixels,CLOAK_SIDE} from '../js/cloak.js';
const frame=(n,color)=>{const out=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++)out.set([...color,255],i*4);return out;};
test('Vanish background learns only uncovered pixels; Ghost and Chameleon reuse it behind the hand',()=>{
 const w=24,h=16,n=w*h,e=new Engine(w,h),room=frame(n,[80,120,160]),empty=new Uint8Array(n),out=new Uint8ClampedArray(n*4);
 e.step(room,empty,out);const camera=frame(n,[240,40,20]),mask=new Uint8Array(n);mask.fill(255);
 for(let i=0;i<5;i++)e.step(camera,mask,out);
 const texture=new Uint8ClampedArray(n*4);cloakPixels(e,camera,'chameleon',texture);
 const center=(8*w+12)*4;assert.ok(Math.abs(texture[center]-80)<12&&Math.abs(texture[center+1]-120)<12,'coarse background palette');assert.ok(texture[center+3]>230);
 cloakPixels(e,camera,'ghost',texture);assert.equal(texture[center+3],255);assert.deepEqual([...texture.slice(center,center+3)],[80,120,160],'Ghost repaints exact learned room without spectral tint');
 const unknown=new Engine(w,h);unknown.alpha.fill(255);cloakPixels(unknown,camera,'chameleon',texture);
 assert.notDeepEqual([...texture.slice(center,center+3)],[240,40,20],'unknown background does not copy the masked hand');
});
test('local cloak renderer stays low-resolution, throttles sampling, learns with no hand and releases buffers',()=>{
 const oldDocument=globalThis.document;let created=0,reads=0;const contexts=[];
 globalThis.document={createElement:()=>{
  const kind=created++%3,c={width:0,height:0};let mask;
  const ctx={drawImage(){},clearRect(){mask=new Uint8ClampedArray(c.width*c.height*4);},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){for(let y=40;y<65;y++)for(let x=65;x<90;x++)mask[(y*c.width+x)*4+3]=255;},getImageData(){reads++;return {data:kind===1?mask:frame(c.width*c.height,[90,125,155])};},createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};
  contexts.push(ctx);c.getContext=()=>ctx;return c;
 }};
 try{
  const c=new CloakRenderer(),lm=Array.from({length:21},(_,i)=>({x:200+i*5,y:180+i*3})),video={videoWidth:640};
  assert.equal(c.update(video,[lm],640,480,'chameleon',1000),true);assert.ok(c.engine.w<=CLOAK_SIDE&&c.engine.h<=CLOAK_SIDE);
  assert.equal(c.image.data[3],0,'no camera-derived pixel outside the hand mask');
  const count=reads;c.update(video,[lm],640,480,'chameleon',1050);assert.equal(reads,count);
  c.update(video,[],640,480,'chameleon',1200);assert.ok(reads>count);assert.ok(c.image.data.every((v,i)=>i%4!==3||v===0),'an empty mask clears every visible camera pixel despite temporal history');
  const image=c.image;c.update(video,[lm],480,640,'ghost',1400);assert.notEqual(c.image,image,'resize replaces ImageData');
  c.clear();assert.equal(c.engine,null);assert.equal(c.image,null);assert.equal(c.raw,null);assert.equal(c.texture,null);
  assert.equal(c.draw({},640,480),false);
 }finally{globalThis.document=oldDocument;}
});

test('switching cameras discards the learned scene before opening the other camera',async()=>{
 const {installBrowser}=await import('./harness.js');const b=installBrowser('?');
 const {HandCam}=await import('../js/hands.js');const cam=new HandCam(b.byId.get('video'),b.byId.get('overlayCanvas'));
 cam.stream={getTracks:()=>[],getVideoTracks:()=>[{getSettings:()=>({deviceId:'front'})}]};
 cam.cloak.engine={w:160,h:120};cam.cloak.image={data:new Uint8ClampedArray(4)};
 cam.startCamera=async()=>null;assert.equal(await cam.flip(),null);
 assert.equal(cam.cloak.engine,null);assert.equal(cam.cloak.image,null);cam.release();
});
