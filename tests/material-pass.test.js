import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until } from './harness.js';
import { makeHand, ALL, FAN } from './helpers.js';
const b = installBrowser('?sim=1'), $ = id => b.byId.get(id);
globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
const P = await import('../js/puppet.js');
const D = await import('../js/dynamics.js');
const S = await import('../js/sand.js');
const C = await import('../js/cosmetics.js');
const PS = await import('../js/particles.js');
await C.loadCatalog();
const hand = (dx=0) => makeHand(ALL, FAN).map(p=>({x:p.x*640+dx,y:p.y*480}));
const find = (n, act) => n.dataset?.act === act ? n : n.children?.map(c=>find(c,act)).find(Boolean);

test('idle strength scales drift and pulse, can turn them off, and remains local/reduced-motion aware', () => {
  const m = [1,0,0,1,10,20], anim = { drift:[1,2,0.5,0], pulse:[0.5,0.4,0] };
  assert.deepEqual(P.animState(anim,m,0.4,0), {m,k:1,moved:false});
  const a=P.animState(anim,m,0.4,1), b=P.animState(anim,m,0.4,2);
  assert.ok(Math.abs((b.m[4]-10)-2*(a.m[4]-10))<1e-9);
  assert.ok(b.k>=0 && b.k<=a.k);
  for (const n of [-1,11,1.5,'5',NaN]) assert.equal(D.setMotionStrength(n),false);
  D.setMotionStrength(10);
  const d=new D.HandDynamics({reduced:()=>true});d.update(hand(),1/30,C.resolveLoadout('robot',[]).skin);
  assert.equal(d.animTime,null); D.setMotionStrength(5);
  assert.deepEqual(C.genWire('robot'),{},'idle style is local; opponent pictures remain still');
});

test('Hand-category idle strength slider updates existing dynamics and persists without changing rig landmarks', async () => {
  await import('../js/main.js');
  $('storeBtn').onclick();
  await until(()=>$('storeGrid').children.length,'catalog');
  $('storeLayers').children.find(c=>c.dataset.value==='base').onclick();
  const sl=find($('catColor'),'motion'); assert.ok(sl);
  const d=new D.HandDynamics({reduced:()=>false}), lm=hand(), before=JSON.stringify(lm);
  sl.value='0';sl.oninput();assert.equal(d.animStrength,0);
  sl.value='8';sl.oninput();sl.onchange();assert.equal(d.animStrength,1.6);
  assert.equal(localStorage.getItem('ff-motion'),'8');
  d.update(lm,1/30,C.resolveLoadout('mechanical',[]).skin);assert.equal(JSON.stringify(lm),before);
  D.setMotionStrength(5);$('storeBack').onclick();
});

test('released sand keeps world-space momentum and eases back; two hands share 84 grains', () => {
  const a=new S.SandMotion(), b=new S.SandMotion(), dt=1/30;
  for (const m of [a,b]) { m.prev=hand();m.c=0.7;m.collapsed=true; }
  a.update(hand(20),dt);b.update(hand(-20),dt);
  const avg = (m,k)=>m.swarm.filter(Boolean).reduce((s,p)=>s+p[k],0)/m.swarm.filter(Boolean).length;
  assert.ok(avg(a,'vx')>avg(b,'vx'),'release inherits hand movement direction');
  const p=a.swarm.find(Boolean), old=p.x;a.update(hand(60),dt);
  assert.ok(Math.abs((p.x-old)-40)>15,'grains do not translate 40px with their home');
  const target=hand(60), palm=Math.hypot(target[5].x-target[17].x,target[5].y-target[17].y);
  const homes=S.GRAINS.map(g=>S.grainHome(target,g,palm));
  const error=()=>a.swarm.reduce((sum,p,i)=>sum+(p?Math.hypot(p.x-homes[i].x,p.y-homes[i].y):0),0);
  a.collapsed=false;a.speed=0;a.hot=0;const start=error();
  for(let i=0;i<12;i++)a.update(hand(60),dt);
  assert.ok(error()<start,'spring reassembly approaches the tracked hand');
  const ps=new PS.ParticleSystem({reduced:()=>false});ps.setSand(C.resolveLoadout('sand',[]).skin.sand);
  for(let i=0;i<30;i++)ps.update(dt,[hand(i%2?30:-30),hand(i%2?-30:30)]);
  assert.ok(ps.motions.reduce((n,m)=>n+m.swarm.filter(Boolean).length,0)<=84);
  assert.ok(ps.list.length+ps.swarmSize<=90);
  assert.ok(ps.motions.every(m=>m.swarm.filter(Boolean).every(p=>[p.x,p.y,p.vx,p.vy,p.alpha].every(Number.isFinite))));
});

test('sand fades tips before palm and the renderer applies the rolling dissolve to worn layers', () => {
  const alpha=S.sandPartAlphas(0.45);assert.ok(alpha.index_tip<alpha.index_mid && alpha.index_mid<alpha.palm);
  assert.ok(Object.values(S.sandPartAlphas(0)).every(a=>a===1));
  assert.ok(Object.values(S.sandPartAlphas(1)).every(a=>a===0));
  const drawn=[],ctx=new Proxy({}, {get:(t,k)=>k==='fill'?()=>drawn.push(t.globalAlpha):()=>{},set:(t,k,v)=>{t[k]=v;return true;}});
  const shape={d:'M 0 0 L 1 1 Z',fill:'#fff',stroke:'none',strokeWidth:0,opacity:1};
  P.drawPlan(ctx,[{part:'index_tip@whiteglove',m:[1,0,0,1,0,0],shapes:[shape]},{part:'palm',m:[1,0,0,1,0,0],shapes:[shape]}],1,null,1,{index_tip:0,palm:0.8});
  assert.deepEqual(drawn,[0.8]);
  const rm=new PS.ParticleSystem({reduced:()=>true});rm.setSand(C.resolveLoadout('sand',[]).skin.sand);rm.update(1/30,[hand()]);
  assert.equal(rm.partAlphas(),null);assert.equal(rm.swarmSize,0);
});

test('material accents stay in existing part/shape bounds and preserve back-only nail visibility', () => {
  for(const id of ['robot','mechanical','gauntlet','goldhand','cyberpunk','hook','sand']) {
    const s=C.resolveLoadout(id,[]).skin;
    assert.ok(Object.values(s.parts).every(p=>p.shapes.length<=12));
  }
  for(const id of ['whiteglove','leather','formal','rubber','boxing','nailpolish','longnails','knight']) {
    const rec=C.resolveLoadout('cartoon',[{id}]);
    assert.ok(Object.values(rec.layers[0].parts).every(shapes=>shapes.length<=12));
    if(id==='nailpolish') {
      assert.equal(P.rigPlan(hand(),rec.skin,rec.layers,false).some(s=>s.part.includes('@nailpolish')),false);
      assert.ok(P.rigPlan(hand(),rec.skin,rec.layers,true).some(s=>s.shapes.some(shape=>shape.anim)));
    }
  }
});
