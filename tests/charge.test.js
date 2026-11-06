import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser} from './harness.js';
import {makeHand,ALL,FAN} from './helpers.js';
installBrowser('?sim=1');
const {HandCharge,chargePose,chargeTheme}=await import('../js/charge.js');
const {ParticleSystem}=await import('../js/particles.js');
const C=await import('../js/cosmetics.js');await C.loadCatalog();
const pose=state=>makeHand(state,FAN).map(p=>({x:p.x*640,y:p.y*480}));
const open=pose(ALL),fist=pose({});
const frames=(state,hand,n)=>{for(let k=0;k<n;k++)state.update([hand],1/30);};
test('fist charge debounces, requires an extended-hand release, re-arms and cancels on tracking loss',()=>{
 const c=new HandCharge();const before=JSON.stringify(fist);
 frames(c,fist,3);frames(c,open,4);assert.equal(c.states[0].power,0,'brief fist is not a charge');
 frames(c,fist,45);assert.equal(c.states[0].charge,1);assert.equal(c.states[0].released,false);
 frames(c,open,1);assert.equal(c.states[0].released,false,'one-frame opening is ignored');
 frames(c,open,2);assert.equal(c.states[0].released,true);frames(c,open,1);assert.equal(c.states[0].released,false,'one burst per opening');
 frames(c,fist,45);c.update([],1/30);frames(c,open,4);assert.equal(c.states[0].power,0,'lost fist cannot release on reacquisition');
 assert.equal(JSON.stringify(fist),before);assert.deepEqual(chargePose(fist),{fist:true,open:false});assert.equal(chargePose([{x:NaN,y:0}]),null);
});
test('two tracked hands charge independently; water freezes/releases ice, earth orbits rocks, and themes match skin families',()=>{
 assert.equal(chargeTheme('robot').release,'sparks');assert.equal(chargeTheme('painting').release,'ink');assert.equal(chargeTheme('frog').release,'splash');assert.equal(chargeTheme('paw').kind,'claw');
 for(const element of ['water','earth','fire','air','sand']){
  const rec=C.resolveLoadout(element==='sand'?'sand':'elemental',[],null,{el:element==='sand'?'earth':element});
  const ps=new ParticleSystem({reduced:()=>false,random:()=>.45});ps.setHandStyle(rec.skin.id);ps.setElement(element);ps.setSand(rec.skin.sand);ps.setEmitters(rec.emitters);
  const other=open.map(p=>({...p,x:p.x+250}));
  for(let k=0;k<45;k++)ps.update(1/30,[fist,other]);
  assert.equal(ps.charge.states[0].charge,1);assert.equal(ps.charge.states[1].charge,0);
  if(element==='water')assert.equal(ps.material.states[0].charge,1);
  if(element==='earth')assert.ok(ps.list.some(p=>p.orbit));
  for(let k=0;k<3;k++)ps.update(1/30,[open,other]);
  assert.equal(ps.charge.states[0].released,true);
  if(element==='water')assert.ok(ps.list.some(p=>p.kind==='ice'));
  if(element==='air')assert.ok(ps.list.some(p=>p.kind==='gust'&&p.span>=2));
  for(let k=0;k<250;k++){
   ps.update(1/30,[k%70<45?fist:open,other]);assert.ok(ps.list.length+ps.swarmSize<=90,element);assert.ok(ps.emitters.length<=6);
   assert.ok(ps.list.every(p=>[p.x,p.y,p.vx,p.vy].every(Number.isFinite)));
  }
  ps.reduced=()=>true;ps.update(.1,[fist]);assert.equal(ps.list.length,0);assert.equal(ps.charge.states.length,0);assert.equal(ps.swarmSize,0);
 }
});
test('Sandman has warm tiled material, stronger dust and stable still drawing under reduced motion',()=>{
 const sand=C.resolveLoadout('sand',[]);assert.ok(sand.emitters.some(e=>e.effect==='dust'&&e.rate>=20));assert.ok(sand.emitters.some(e=>e.effect==='stone'));
 const ps=new ParticleSystem({reduced:()=>true});ps.setHandStyle('sand');ps.setSand(sand.skin.sand);ps.setElement('sand');
 const colors=[];const ctx=new Proxy({},{get:()=>()=>{},set:(o,k,v)=>{if(k==='fillStyle')colors.push(v);o[k]=v;return true;}});
 ps.update(.1,[open]);assert.equal(ps.drawBody(ctx,[open]),true);assert.ok(colors.includes('#e2bf7e'));assert.equal(ps.list.length,0);
 const tinted=C.resolveLoadout('sand',[],'#25d3e4');ps.setSand(tinted.skin.sand);colors.length=0;ps.drawBody(ctx,[open]);assert.ok(colors.includes(tinted.skin.sand.color),'the redesigned material still follows custom colour');
});
test('release works with one or two fingers, including thumb only, without changing skin wire data',()=>{
 for(const st of [{index:true},{index:true,middle:true},{thumb:true}]){
  const c=new HandCharge();frames(c,fist,45);frames(c,pose(st),3);assert.equal(c.states[0].released,true,'valid low-finger choices can release charge');
 }
 for(const [id,kind] of [['robot','spark'],['painting','ink'],['paw','glint'],['floppy','bubble'],['eyes','eye'],['ghost','ripple'],['lowpoly','ice'],['flaming','flame'],['frog','splash']]){
  const rec=C.resolveLoadout(id,[]),before=JSON.stringify(C.genWire(id)),ps=new ParticleSystem({reduced:()=>false,random:()=>.45});
  ps.setHandStyle(id);ps.setEmitters(rec.emitters);assert.equal(ps.active,true);
  for(let k=0;k<45;k++)ps.update(1/30,[fist]);for(let k=0;k<3;k++)ps.update(1/30,[open]);
  assert.equal(ps.charge.states[0].released,true,id);assert.ok(ps.list.some(p=>p.kind===kind),id+' matching release');
  assert.equal(JSON.stringify(C.genWire(id)),before,'charge never becomes network cosmetic metadata');assert.ok(ps.list.length<=90);
 }
});
