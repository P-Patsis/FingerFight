import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until } from './harness.js';
import { makeHand, ALL, FAN } from './helpers.js';
const b=installBrowser('?sim=1'),$=id=>b.byId.get(id);
const C=await import('../js/cosmetics.js'),P=await import('../js/puppet.js'),D=await import('../js/dynamics.js');
const {validPicture}=await import('../js/logic.js');
const {comicLabels,drawComic}=await import('../js/handfx.js');
const {ParticleSystem}=await import('../js/particles.js');
const {HandCam}=await import('../js/hands.js');
await C.loadCatalog();
const hand=()=>makeHand(ALL,FAN).map(p=>({x:p.x*640,y:p.y*480}));
const find=(n,act)=>n.dataset?.act===act?n:n.children?.map(c=>find(c,act)).find(Boolean);
const reset=()=>C.setGen({nl:5,el:'water',fi:7});

test('Nail length affects every Nails item, zero hides it, and receiver parameters override local preferences',()=>{
 for(const item of C.catalog().filter(e=>e.layer==='nails')){
  C.setGen({nl:3});const small=C.resolveLoadout('cartoon',[{id:item.id}]);
  C.setGen({nl:10});const big=C.resolveLoadout('cartoon',[{id:item.id}]);
  if(item.id==='longfingers')assert.ok(P.activeExtend(big.skin,big.layers).len>P.activeExtend(small.skin,small.layers).len);
  else{
   const a=P.rigPlan(hand(),small.skin,small.layers,true).find(s=>s.part.includes('@'+item.id) && (item.id === 'knuckleclaws' || s.part.startsWith('thumb_tip')));
   const z=P.rigPlan(hand(),big.skin,big.layers,true).find(s=>s.part.includes('@'+item.id) && (item.id === 'knuckleclaws' || s.part.startsWith('thumb_tip')));
   assert.ok(Math.hypot(z.m[2],z.m[3])>Math.hypot(a.m[2],a.m[3]),item.id);
  }
  assert.deepEqual(C.resolveLoadout('cartoon',[{id:item.id}],null,{nl:0}).layers,[]);
  assert.deepEqual(C.resolveLoadout('cartoon',[{id:item.id}],null,{nl:3}).layers,small.layers,'receiver draws sender length');
 }
 C.setGen({nl:0});const paw=C.resolveLoadout('paw',[]);assert.ok(!P.rigPlan(hand(),paw.skin,paw.layers,true).some(s=>s.part.endsWith('+')));
 const picture={view:'puppet',skin:'elemental',hands:[],lm:null,ar:1.333,photo:''};
 for(const nl of [0,1,5,10])assert.ok(validPicture({...picture,nl,el:'water'},false));
 for(const nl of [-1,11,1.2,'5',{},NaN])assert.equal(validPicture({...picture,nl},false),false);
 for(const el of ['water','fire','earth','air'])assert.ok(validPicture({...picture,el},false));
 for(const el of ['lava','<img>','',4,{}])assert.equal(validPicture({...picture,el},false),false);
 reset();
});

test('five metallic scissor blades and three large palm-mounted knuckle claws fit pictures without changing landmarks',()=>{
 const lm=hand(),before=JSON.stringify(lm),rec=C.resolveLoadout('cartoon',[{id:'scissors'}]);
 assert.equal(P.rigPlan(lm,rec.skin,rec.layers,true).filter(s=>s.part.endsWith('_tip@scissors')).length,5);
 assert.ok(rec.layers[0].parts.thumb_tip.some(s=>s.anim));
 const knuckle=C.resolveLoadout('cartoon',[{id:'knuckleclaws'}]);
 assert.equal(knuckle.layers[0].parts.palm.length,10);
 assert.equal(knuckle.layers[0].fit.length,3);
 assert.ok(P.cosmeticEnds(lm,knuckle.skin,knuckle.layers).some(p=>p.y<Math.min(...lm.map(p=>p.y))));
 assert.equal(JSON.stringify(lm),before);assert.equal(lm.length,21);
 assert.throws(()=>C.parseItem({format:1,id:'bad',layer:'nails',fit:[{part:'elbow',x:0,y:0}],parts:{palm:[{d:'M 0 0 L 1 1'}]}}),/fitting/);
});

test('hotdog tips have independent bends and bounded spring motion; reduced motion remains still',()=>{
 const rec=C.resolveLoadout('floppy',[]),lm=hand(),before=JSON.stringify(lm);
 assert.equal(rec.skin.tint.default,'#d6a77a');assert.equal(rec.skin.extend.spread,1);
 const angles=P.FINGER_NAMES.map(f=>{const p=P.extensionPieces(lm,f,rec.skin.extend).at(-1);return Math.atan2(p.b.y-p.a.y,p.b.x-p.a.x);});
 assert.ok(Math.max(...angles)-Math.min(...angles)>0.3);
 const d=new D.HandDynamics({reduced:()=>false});for(let i=0;i<120;i++)d.update(lm.map(p=>({...p,x:p.x+Math.sin(i*.2)*30})),1/30,rec.skin,[]);
 assert.ok(Object.values(d.ends).flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 const rm=new D.HandDynamics({reduced:()=>true});rm.update(lm,1/30,rec.skin,[]);assert.deepEqual(rm.ends,{});
 const vertical = lm.map(p=>({...p})); for(const i of [5,6,7,8]) vertical[i].x = lm[5].x;
 const a=vertical.map(p=>({...p})),b=vertical.map(p=>({...p})); a[8].x+=0.0001;b[8].x-=0.0001;
 const ea=P.extensionPieces(a,'index',rec.skin.extend).at(-1).b,eb=P.extensionPieces(b,'index',rec.skin.extend).at(-1).b;
 assert.ok(Math.hypot(ea.x-eb.x,ea.y-eb.y)<0.1,'tiny tracker noise does not flip the sag direction');
 assert.equal(JSON.stringify(lm),before);
});

test('all four elemental modes are distinct, reproducible and stay within particle caps',()=>{
 const parts=[];
 for(const el of ['water','fire','earth','air']){
  C.setGen({el});const rec=C.resolveLoadout('elemental',[]);parts.push(JSON.stringify(rec.skin.parts));
  assert.deepEqual(C.resolveLoadout('elemental',[],null,{el}).skin.parts,rec.skin.parts);
  assert.equal(C.genWire('elemental').el,el);
  const ps=new ParticleSystem({reduced:()=>false});ps.setEmitters(rec.emitters);
  for(let i=0;i<180;i++)ps.update(1/30,[hand()]);assert.ok(ps.list.length<=90&&ps.emitters.length<=6);
 }
 assert.equal(new Set(parts).size,4);reset();
});

test('comic bursts show zero and ten, use fixed generic words and draw without a second detector',()=>{
 assert.equal(comicLabels(0)[0],'0');assert.equal(comicLabels(10)[0],'10');assert.equal(comicLabels(5)[0],'5');
 assert.ok(comicLabels(5,4).includes('BOOM'));assert.notEqual(...comicLabels(null),'unknown-count preview uses two distinct impact words');
 const texts=[],ctx=new Proxy({}, {get:(_,k)=>k==='fillText'?(t)=>texts.push(t):()=>{},set:()=>true});
 drawComic(ctx,[hand()],3,640,480,2);assert.ok(texts.includes('3'));assert.ok(texts.includes('POW'));
});

test('new special hands remain data-only for strangers; private photo rules still gate every JPEG',()=>{
 const video=$('video');video.videoWidth=640;video.videoHeight=480;
 for(const skin of ['comic','elemental','chameleon','ghost']){
  const cam=new HandCam(video,$('overlayCanvas'));cam.samples=Array.from({length:7},()=>({has:true,count:5,gesture:null,hands:[makeHand(ALL,FAN)]}));
  cam.setOverlay('puppet',skin,[]);const m=cam.snap({mode:'puppet',skin});
  assert.equal(m.photo,'');assert.ok(validPicture(m,false));assert.ok(!Object.hasOwn(m,'texture')&&!Object.hasOwn(m,'background'));
  assert.equal(validPicture({...m,photo:'data:image/jpeg;base64,AAAA'},false),false);
  cam.release();assert.equal(cam.cloak.image,null);
 }
 reset();
});

test('Nails-only length slider persists, clear-all removes worn items, and elemental selector updates the preview',async()=>{
 await import('../js/main.js');$('storeBtn').onclick();await until(()=>$('storeGrid').children.length,'catalog');
 const chip=value=>$('storeLayers').children.find(c=>c.dataset.value===value);
 assert.equal(chip('nails').textContent,'Nails');chip('nails').onclick();
 const sl=find($('catColor'),'naillength');assert.ok(sl);
 const card=id=>$('storeGrid').children.find(c=>c.dataset.id===id);
 card('nailpolish').onclick();card('knuckleclaws').onclick();
 sl.value='8';sl.oninput();sl.onchange();assert.equal(localStorage.getItem('ff-naillength'),'8');assert.equal(C.genWire('cartoon').nl,8);
 $('storeClear').onclick();assert.ok(!$('storeGrid').children.some(c=>c.classList.contains('eq')));
 chip('base').onclick();assert.equal(find($('catColor'),'naillength'),undefined);
 card('elemental').onclick();const elements=$('catColor').children.find(c=>c.getAttribute('aria-label')==='Element');
 elements.children.find(c=>c.dataset.value==='air').onclick();assert.equal(C.gen.el,'air');assert.equal(localStorage.getItem('ff-element'),'air');
 $('storeBack').onclick();reset();
});
