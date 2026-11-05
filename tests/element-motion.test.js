import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser} from './harness.js';
import {makeHand,ALL,FAN} from './helpers.js';
installBrowser('?');
const C=await import('../js/cosmetics.js');
const {ParticleSystem}=await import('../js/particles.js');
await C.loadCatalog();
const base=makeHand(ALL,FAN).map(p=>({x:p.x*640,y:p.y*480}));
const moved=(dx,dy=0)=>base.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
function system(mode){let seed=123;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};const ps=new ParticleSystem({reduced:()=>false,random:rnd});const rec=C.resolveLoadout('elemental',[],null,{el:mode});ps.setElement(mode);ps.setSand(rec.skin.sand);ps.setEmitters(rec.emitters);return ps;}
function simulate(ps,moving){for(let i=0;i<30;i++)ps.update(1/30,[moved(moving?i*9:0)]);return ps;}
test('water has bounded liquid lag, finger-local slosh and velocity-driven droplets without changing tracked coordinates',()=>{
 const original=JSON.stringify(base),rest=simulate(system('water'),false),move=simulate(system('water'),true);
 assert.ok(move.list.filter(p=>p.kind==='splash').length>rest.list.filter(p=>p.kind==='splash').length*1.5);
 assert.ok(move.list.filter(p=>p.kind==='splash').reduce((s,p)=>s+p.vx,0)>0,'drops inherit rightward momentum');
 const h=moved(261),visual=move.visualHands([h])[0];assert.ok(visual[12].x<h[12].x,'liquid trails movement');
 assert.ok(Math.abs(visual[12].x-h[12].x)<60,'bounded deformation');
 for(let i=0;i<100;i++)move.update(1/30,[h]);const settled=move.visualHands([h])[0];assert.ok(Math.abs(settled[12].x-h[12].x)<5,'spring settles when held');
 assert.equal(JSON.stringify(base),original);
 const fingers=system('water');fingers.update(1/30,[base]);for(let i=0;i<8;i++)fingers.update(1/30,[base.map((p,j)=>({...p,x:p.x+(j===12?Math.sin(i)*24:0)}))]);assert.ok(fingers.material.states[0].speed>0,'finger changes also stir water');
});
test('air waves stay at historical positions, expand and expire instead of orbiting the current hand',()=>{
 const ps=simulate(system('air'),true),wake=ps.list.find(p=>p.kind==='gust');assert.ok(wake?.wake);
 const old={x:wake.cx,y:wake.cy,r:wake.radius},destination=moved(1000);
 for(let i=0;i<6;i++)ps.update(1/30,[destination]);
 assert.ok(Math.abs(wake.cx-old.x)<30,'old wave stays behind after a large move');assert.ok(wake.radius>old.r);
 const states=new Set(ps.list.filter(p=>p.kind==='gust').map(p=>p.cx.toFixed(1)));assert.ok(states.size>4,'multiple historical wakes');
 for(let i=0;i<70;i++)ps.update(1/30,[]);assert.ok(!ps.list.includes(wake),'history expires');
});
test('fire leans opposite hand movement, increases shedding and keeps released flames in world space',()=>{
 const still=simulate(system('fire'),false),ps=simulate(system('fire'),true),flames=ps.list.filter(p=>p.kind==='flame');
 assert.ok(flames.length>still.list.length);assert.ok(flames.some(p=>p.bend<-.5));assert.ok(flames.some(p=>p.vx>40));
 const p=flames[0],old=p.x;ps.update(1/30,[moved(-1000)]);assert.ok(Math.abs(p.x-old)<40,'flame does not teleport to hand');
});
test('Earth sheds varied rotating shards from different parts with temporary holes, dust and gravity, then returns them',()=>{
 const ps=simulate(system('earth'),true),stones=ps.list.filter(p=>p.kind==='stone');assert.ok(stones.length>4);
 assert.ok(new Set(stones.map(p=>p.size.toFixed(2))).size>4);assert.ok(new Set(stones.map(p=>p.part)).size>2);assert.ok(new Set(stones.map(p=>p.sides)).size>1);
 assert.ok(ps.list.some(p=>p.kind==='dust'));assert.equal(ps.swarmSize,0);assert.ok(Object.values(ps.partAlphas()[0]).some(a=>a<.5));
 const p=stones[0],h=moved(261);p.age=p.life*.8;p.x=h[p.home].x+80;p.y=h[p.home].y+80;p.vx=0;p.vy=0;const distance=()=>Math.hypot(p.x-h[p.home].x,p.y-h[p.home].y),d=distance();
 ps.update(.1,[h]);assert.ok(distance()<d,'return spring attracts shard to its current home');
 for(const mode of ['earth','water','fire','air']){const s=system(mode);for(let i=0;i<300;i++){s.update(1/30,[moved(Math.sin(i*.5)*200),moved(-Math.sin(i*.5)*200)]);assert.ok(s.list.length+s.swarmSize<=90);assert.ok(s.list.every(p=>[p.x,p.y,p.vx,p.vy].every(Number.isFinite)));}s.reduced=()=>true;s.update(.1,[base]);assert.equal(s.list.length,0);assert.deepEqual(s.visualHands([base]),[base]);}
});
