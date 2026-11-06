// Exports actual procedural bodies, particles and charge states. Raster/phone review are separate.
import {writeFileSync} from 'node:fs';
import {installBrowser} from '../tests/harness.js';
import {svgContext} from './canvas-svg.mjs';
installBrowser('?sim=1');
const C=await import('../js/cosmetics.js'),P=await import('../js/puppet.js');
const {ParticleSystem}=await import('../js/particles.js');await C.loadCatalog();
const open=P.statesToLandmarks({thumb:true,index:true,middle:true,ring:true,pinky:true}).map(([x,y])=>({x:x*.28+64,y:y*.28+6}));
const fist=P.statesToLandmarks({}).map(([x,y])=>({x:x*.28+64,y:y*.28+6}));
const modes=['water','fire','earth','air','sand'];
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="2100" viewBox="0 0 1280 2100"><rect width="1280" height="2100" fill="#080f20"/><text x="20" y="28" fill="white" font-size="20">Fist charge and release — actual procedural states</text><text x="20" y="51" fill="#94a3b8" font-size="13">Open / charging / fully charged fist / open-hand release. Canvas commands exported to SVG, not a phone screenshot.</text>';
const sample=(id,element,phase)=>{
 let seed=815;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const rec=C.resolveLoadout(id,[],null,element?{el:element}:null),ps=new ParticleSystem({reduced:()=>false,random:rnd});
 ps.setHandStyle(id);ps.setElement(element||null);ps.setSand(rec.skin.sand);ps.setEmitters(rec.emitters);
 for(let k=0;k<15;k++)ps.update(1/30,[open]);
 if(phase)for(let k=0;k<(phase===1?20:45);k++)ps.update(1/30,[fist]);
 if(phase===3)for(let k=0;k<6;k++)ps.update(1/30,[open]);
 return {ps,hand:phase===1||phase===2?fist:open};
};
for(let row=0;row<modes.length;row++)for(let col=0;col<4;col++){
 const mode=modes[row],{ps,hand}=sample(mode==='sand'?'sand':'elemental',mode,col),{ctx,output}=svgContext();
 ps.drawBody(ctx,[hand]);ps.draw(ctx);
 const x=col*320,y=70+row*330;
 svg+=`<g transform="translate(${x},${y})"><rect x="3" width="314" height="324" rx="12" fill="#0f172a"/><text x="12" y="23" fill="#e2e8f0" font-size="14">${mode} · ${['open','charging','charged','release'][col]}</text>${output()}</g>`;
}
for(const [col,id]of ['robot','painting','paw','floppy'].entries()){
 const {ps,hand}=sample(id,null,3),{ctx,output}=svgContext();
 ctx.strokeStyle='#334155';ctx.lineWidth=3;for(const ids of [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]]){ctx.beginPath();ids.forEach((j,k)=>k?ctx.lineTo(hand[j].x,hand[j].y):ctx.moveTo(hand[j].x,hand[j].y));ctx.stroke();}
 ps.draw(ctx);svg+=`<g transform="translate(${col*320},1720)"><rect x="3" width="314" height="324" rx="12" fill="#0f172a"/><text x="12" y="23" fill="#e2e8f0" font-size="14">${id} · release overlay (rig omitted)</text>${output()}</g>`;
}
svg+='</svg>';writeFileSync('artifacts/charge-review.svg',svg);console.log('artifacts/charge-review.svg');
// Compare idle / charge / release CPU paths with two hands; canvas calls are counted, no GPU claimed.
const open2=open.map(p=>({...p,x:p.x+260})),fist2=fist.map(p=>({...p,x:p.x+260}));
let calls=0;const ctx=new Proxy({},{get:()=>()=>{calls++},set:()=>true});
for(const mode of modes){const {ps}=sample(mode==='sand'?'sand':'elemental',mode,0);let elapsed=0;calls=0;
 for(let k=0;k<420;k++){const hands=[k%90<55?fist:open,(k+40)%90<55?fist2:open2],start=performance.now();ps.update(1/30,hands);ps.drawBody(ctx,hands);ps.draw(ctx);if(k>=60)elapsed+=performance.now()-start;}
 console.log(`${mode}: ${(elapsed/360).toFixed(3)} ms/frame JS-only, two hands, ${Math.round(calls/420)} canvas calls/frame; particles ${ps.list.length+ps.swarmSize}/90`);
}
