// CPU-only material/particle benchmark with two synthetic hands. Fake canvas; excludes tracking, rasterisation and GPU.
// Run: node tools/profile_materials.mjs
import {installBrowser} from '../tests/harness.js';installBrowser('?sim=1');globalThis.Path2D=class{constructor(d){this.d=d;}};
const C=await import('../js/cosmetics.js'),P=await import('../js/puppet.js'),{ParticleSystem}=await import('../js/particles.js');await C.loadCatalog();
const pose=st=>P.statesToLandmarks(st).map(([x,y])=>({x:x*.28+64,y:y*.28+6})),open=pose({thumb:true,index:true,middle:true,ring:true,pinky:true}),fist=pose({});
const open2=open.map(p=>({...p,x:p.x+260})),fist2=fist.map(p=>({...p,x:p.x+260}));
let calls=0;const ctx=new Proxy({},{get:()=>()=>{calls++;},set:()=>true});
for(const mode of ['water','fire','earth','air','sand']){let seed=21;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const rec=C.resolveLoadout(mode==='sand'?'sand':'elemental',[],null,{el:mode}),ps=new ParticleSystem({reduced:()=>false,random:rnd});ps.setHandStyle?.(rec.skin.id);ps.setElement(mode);ps.setEmitters(rec.emitters);ps.setSand(rec.skin.sand);let total=0;calls=0;
 for(let k=0;k<480;k++){const hands=[k%90<55?fist:open,(k+40)%90<55?fist2:open2],t=performance.now();if(ps.active)ps.update(1/30,hands);if(!ps.drawBody(ctx,hands))P.drawPuppet(ctx,hands,rec.skin,rec.layers,[],ps.bodyAlphas(),null,ps.partAlphas());if(ps.active)ps.draw(ctx);if(k>=120)total+=performance.now()-t;}
 console.log(`${mode}: ${(total/360).toFixed(3)} ms/frame JS-only; ${Math.round(calls/480)} canvas calls/frame`);
}
