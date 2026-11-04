// Static vector review of the actual rig paths, plus JS-only timing. No browser or raster/GPU claims.
// Run from repository root: node tools/review_materials.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { installBrowser } from '../tests/harness.js';
installBrowser('?sim=1');
globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
const P = await import('../js/puppet.js');
const C = await import('../js/cosmetics.js');
const S = await import('../js/sand.js');
const D = await import('../js/dynamics.js');
const PS = await import('../js/particles.js');
await C.loadCatalog();
const baseline = 'd714108';
const before = (folder,id) => JSON.parse(execFileSync('git',['show',`${baseline}:assets/${folder}/${id}.json`],{encoding:'utf8'}));
const pose = P.statesToLandmarks({thumb:true,index:true,middle:true,ring:true,pinky:true});
const hand = pose.map(([x,y])=>({x:x*0.24+38,y:y*0.24+5}));
const esc = s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const f = n=>Number(n.toFixed(4));
const samples = [
 ['Sand surface','sand',[]],['Sand crumble','sand',[],0.55],
 ['Mechanical','mechanical',[]],['Golden hand','goldhand',[]],['Robot','robot',[]],
 ['Knight armour','cartoon',['knight']],['White glove','cartoon',['whiteglove']],
 ['Leather','cartoon',['leather']],['Rubber','cartoon',['rubber']],
 ['Polished nails','cartoon',['nailpolish']],['Long nails + gold ring','cartoon',['longnails','goldring']],
];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${90+samples.length*300}" viewBox="0 0 720 ${90+samples.length*300}"><rect width="100%" height="100%" fill="#080f20"/><g font-family="Arial,sans-serif" fill="#f8fafc"><text x="24" y="30" font-size="20">Finger Fight — material review</text><text x="24" y="51" font-size="12" fill="#94a3b8">Static samples from rigPlan + animState at t=1.4 s. Phone motion and GPU still need review.</text><text x="100" y="76">Before (${baseline})</text><text x="430" y="76">After</text></g>`;
for (let row=0; row<samples.length;row++) {
 const [label,id,items,collapse] = samples[row];
 for (let col=0;col<2;col++) {
  const rec = col ? C.resolveLoadout(id,items.map(id=>({id}))) : {skin:P.parseSkin(before('skins',id)),layers:items.map(id=>C.parseItem(before('items',id)))};
  const alpha=collapse ? (col ? S.sandPartAlphas(collapse) : Object.fromEntries(P.PART_NAMES.map(p=>[p,1-collapse]))) : null;
  const plan=P.rigPlan(hand,rec.skin,rec.layers,true);
  svg+=`<g transform="translate(${col*350+10},${90+row*300})"><rect width="340" height="290" rx="14" fill="#0f172a"/><text x="14" y="23" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="14">${esc(label)}</text>`;
  for(const step of plan) for(const shape of step.shapes) {
   const a=shape.anim?P.animState(shape.anim,step.m,1.4):{m:step.m,k:1};
   const k=shape.opacity*a.k*(alpha?.[step.part.split(/[@+]/)[0]]??1);
   svg+=`<path d="${esc(shape.d)}" transform="matrix(${a.m.map(f).join(' ')})" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" opacity="${f(k)}"/>`;
  }
  if(collapse && col) {
   const motion=new S.SandMotion();motion.c=collapse;motion.collapsed=true;motion.prev=hand;
   for(let i=0;i<10;i++){motion.advanceSwarm(hand,1/30,0,1);motion.time+=1/30;}
   for(const p of motion.swarm.filter(Boolean))svg+=`<rect x="${f(p.x)}" y="${f(p.y)}" width="2" height="2" fill="${p.shade===1?'#f7e6b8':p.shade===2?'#997c4e':'#e2bf7e'}" opacity="${f(p.alpha)}"/>`;
  }
  svg+='</g>';
 }
}
svg+='</svg>\n';mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/material-review.svg',svg);
console.log('Wrote artifacts/material-review.svg (static vector review; not a phone screenshot).');
let calls=0;const ctx=new Proxy({}, {get:()=>()=>{calls++},set:()=>true});
for(const [id,stack] of [['cartoon',[]],['mechanical',[]],['sand',[]],['flaming',[]],['cartoon',['whiteglove','nailpolish','goldring']],['cartoon',['whiteglove','leather','fingerless','knight','rubber','formal','boxing','nailpolish','longnails','goldring','silverring','ornate']]]) {
 const rec=C.resolveLoadout(id,stack.map(id=>({id}))),ds=[new D.HandDynamics({reduced:()=>false}),new D.HandDynamics({reduced:()=>false})],ps=new PS.ParticleSystem({reduced:()=>false});ps.setEmitters(rec.emitters);ps.setSand(rec.skin.sand);
 let total=0;calls=0;
 for(let i=0;i<700;i++) {
  const hands=[hand.map(p=>({...p,x:p.x+(id==='sand'?Math.sin(i*0.6)*50:0)})),hand];
  const t=performance.now();const hd=hands.map((h,k)=>ds[k].update(h,1/30,rec.skin,rec.layers));
  ps.update(1/30,hands);P.drawPuppet(ctx,hands,rec.skin,rec.layers,[],ps.bodyAlphas(),hd,ps.partAlphas());ps.draw(ctx);
  if(i>=100)total+=performance.now()-t;
 }
 console.log(`${id}${stack.length?' + '+stack.length+' items':''}: ${(total/600).toFixed(3)} ms/frame for two hands, JS only; ${Math.round(calls/700)} canvas calls/frame`);
}
