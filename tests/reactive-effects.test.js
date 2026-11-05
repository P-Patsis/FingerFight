import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser} from './harness.js';
import {makeHand,ALL,FAN} from './helpers.js';
const b=installBrowser('?');
globalThis.Path2D??=class{constructor(d){this.d=d;}};
const {ComicMotion,comicWords}=await import('../js/handfx.js');
const {validPicture}=await import('../js/logic.js');
const C=await import('../js/cosmetics.js');const {ParticleSystem}=await import('../js/particles.js');
const {Engine}=await import('../js/vanish-engine.js');const {cloakPixels}=await import('../js/cloak.js');
const {HandCam}=await import('../js/hands.js');await C.loadCatalog();
const hand=(dx=0)=>makeHand(ALL,FAN).map(p=>({x:p.x*640+dx,y:p.y*480}));
const frame=(n,color)=>{const f=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++)f.set([...color,255],i*4);return f;};

test('Comic is quiet while held still, reacts to opening/motion, stays screen-anchored and expires',()=>{
 const c=new ComicMotion({reduced:()=>false}),dt=1/30;
 for(let i=0;i<60;i++)c.update([hand()],0,dt,640,480);assert.deepEqual(c.events,[]);
 for(let i=0;i<8;i++)c.update([hand()],5,dt,640,480);assert.equal(c.events[0].s,'5');
 const position={x:c.events[0].x,y:c.events[0].y};c.update([hand(30)],5,dt,640,480);
 assert.deepEqual({x:c.events[0].x,y:c.events[0].y},position,'burst does not ride hand/finger motion');
 for(let i=0;i<40;i++)c.update([hand(30)],5,dt,640,480);assert.deepEqual(c.events,[]);
 for(let i=0;i<5;i++)c.update([hand(30+i*20)],5,dt,640,480);
 assert.ok(c.events.some(e=>comicWords.includes(e.s)));assert.ok(comicWords.includes('WOW')&&comicWords.length>=8);
 const fonts=[],ctx=new Proxy({}, {get:()=>()=>{},set:(t,k,v)=>{t[k]=v;if(k==='font')fonts.push(v);return true;}});
 c.draw(ctx,640,480);assert.ok(fonts.some(f=>parseInt(f.match(/\d+px/)[0])>=70),'large screen-space text');
 for(let i=0;i<8;i++)c.trigger(null,[hand()],640,480);assert.equal(c.events.length,2);
 const rm=new ComicMotion({reduced:()=>true});rm.trigger('POW',[hand()],640,480);assert.deepEqual(rm.events,[]);
});

test('only bounded, whitelisted comic event metadata is accepted from peers',()=>{
 const m={view:'puppet',skin:'comic',hands:[],lm:null,ar:1.3,photo:''};
 assert.ok(validPicture({...m,cb:[{s:'WOW',x:500,y:200}]},false));
 for(const cb of [[{s:'<img>',x:500,y:200}],[{s:'POW',x:-1,y:0}],[{s:'POW',x:1.5,y:0}],[{s:'POW',x:0,y:NaN}],[{s:'POW',x:0,y:0,photo:'x'}],Array(3).fill({s:'POW',x:0,y:0})])assert.equal(validPicture({...m,cb},false),false);
});

test('elemental effects occupy space outside the hand; Earth crumbles and reforms without exceeding the shared cap',()=>{
 const lm=hand(),before=JSON.stringify(lm),palm=Math.hypot(lm[5].x-lm[17].x,lm[5].y-lm[17].y),center={x:[0,5,9,13,17].reduce((s,i)=>s+lm[i].x,0)/5,y:[0,5,9,13,17].reduce((s,i)=>s+lm[i].y,0)/5};
 for(const element of ['water','fire','earth','air']){
  const rec=C.resolveLoadout('elemental',[],null,{el:element}),ps=new ParticleSystem({reduced:()=>false});ps.setEmitters(rec.emitters);ps.setElement(element);ps.setSand(rec.skin.sand);
  let minBody=1,peak=0;
  for(let i=0;i<138;i++){ps.update(1/30,[lm]);peak=Math.max(peak,ps.list.length+ps.swarmSize);minBody=Math.min(minBody,ps.bodyAlphas()[0]??1);}
  assert.ok(peak<=90&&ps.emitters.length<=6,element+' budget');
  assert.ok(ps.list.every(p=>[p.x,p.y,p.vx,p.vy].every(Number.isFinite)));
  if(element==='water'){assert.ok(ps.list.some(p=>p.kind==='splash'));assert.ok(ps.list.some(p=>Math.hypot(p.x-center.x,p.y-center.y)>palm));}
  if(element==='air')assert.ok(ps.list.some(p=>p.kind==='gust'&&p.radius>palm));
  if(element==='earth'){assert.ok(rec.skin.sand.chunks);assert.equal(minBody,0);assert.equal(ps.bodyAlphas()[0],1,'whole hand reformed');}
  const rm=new ParticleSystem({reduced:()=>true});rm.setEmitters(rec.emitters);rm.setElement(element);rm.setSand(rec.skin.sand);rm.update(0.1,[lm]);assert.equal(rm.list.length+rm.swarmSize,0);
 }
 assert.equal(JSON.stringify(lm),before);
});

test('Ghost replaces known pixels exactly and leaves unknown areas alone; Chameleon adapts from wrist to tips in geometric colours',()=>{
 const w=40,h=40,n=w*h,room=frame(n,[80,120,160]),skin=frame(n,[210,130,75]),e=new Engine(w,h),out=new Uint8ClampedArray(n*4),mask=new Uint8Array(n);
 e.step(room,mask,out);e.alpha.fill(255);const state={},image=new Uint8ClampedArray(n*4);
 cloakPixels(e,skin,'ghost',image);assert.deepEqual([...image.slice(0,4)],[80,120,160,255]);
 e.model.n[0]=0;cloakPixels(e,skin,'ghost',image);assert.equal(image[3],0);e.model.n[0]=1;
 cloakPixels(e,skin,'chameleon',image,{elapsed:0,dt:0.1,state});assert.deepEqual([...image.slice(0,3)],[210,130,75]);
 for(let t=0.1;t<0.91;t+=0.1)cloakPixels(e,skin,'chameleon',image,{elapsed:t,dt:0.1,state});
 const top=(2*w+12)*4,bottom=(36*w+12)*4;
 assert.ok(210-image[bottom]>210-image[top],'lower hand starts changing before fingertips');
 for(let t=1;t<7;t+=0.1)cloakPixels(e,skin,'chameleon',image,{elapsed:t,dt:0.1,state});
 assert.ok(image[bottom]<115,'colour adapts towards the learned background');
 assert.notEqual(image[(1*w+1)*4],image[(6*w+6)*4],'coarse triangular facets have distinct shades');
});

test('Ghost and Chameleon keep camera pixels exclusive to photo views',()=>{
 const oldRaf=globalThis.requestAnimationFrame,video=b.byId.get('video');let next,painted=0,patches=0;
 globalThis.requestAnimationFrame=cb=>{next=cb;return 1;};
 const ctx=new Proxy({}, {get:(_,k)=>k==='fill'?()=>painted++:()=>{},set:()=>true});
 Object.assign(video,{videoWidth:640,videoHeight:480,readyState:2,currentTime:1});
 const cam=new HandCam(video,{width:640,height:480,getContext:()=>ctx});cam.landmarker={detectForVideo:()=>({landmarks:[makeHand(ALL,FAN)]})};
 try{
  cam.cloak.update=()=>true;cam.cloak.draw=()=>{patches++;return true;};
  for(const skin of ['ghost','chameleon']){
   cam.setOverlay('puppet',skin,[]);assert.equal(video.classList.contains('feed-hidden'),true);
   painted=0;patches=0;cam.run();video.currentTime++;next();
   assert.equal(patches,0,'no camera-derived patch in puppet-only mode');assert.ok(painted>0,'authored puppet remains visible');
   assert.equal(cam.snap({mode:'puppet',skin}).photo,'');
   cam.setOverlay('photo-puppet',skin,[]);assert.equal(video.classList.contains('feed-hidden'),false);
   painted=0;video.currentTime++;next();assert.ok(patches>0);assert.equal(painted,0,'photo view uses Vanish without puppet body');
   cam.setOverlay('puppet',skin,[]);assert.equal(video.classList.contains('feed-hidden'),true);
   patches=0;video.currentTime++;next();assert.equal(patches,0,'switching back removes cached camera patches');cam.pause();
  }
 }finally{cam.pause();globalThis.requestAnimationFrame=oldRaf;}
});
