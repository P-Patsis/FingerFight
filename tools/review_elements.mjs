// Actual rig/particle states exported as SVG. This is a vector review, not a phone screenshot.
import {writeFileSync} from 'node:fs';
import {installBrowser} from '../tests/harness.js';
installBrowser('?sim=1');
const C=await import('../js/cosmetics.js'),P=await import('../js/puppet.js');
const {previewHandPx}=await import('../js/avatars.js');
const {ParticleSystem,drawParticles}=await import('../js/particles.js');
await C.loadCatalog();
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const f=v=>Number(v.toFixed(3));let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1430" viewBox="0 0 1080 1430"><rect width="1080" height="1430" fill="#080f20"/><text x="20" y="28" fill="white" font-size="20">Elemental movement — actual drawing states</text><text x="20" y="50" fill="#94a3b8" font-size="13">Left: held still. Middle: moving right. Right: reversal and lingering wakes. Vector export; phone review needed.</text>';
function context(){let path='',stack=[];const c={globalAlpha:1,lineWidth:1,fillStyle:'#fff',strokeStyle:'#fff',save(){stack.push([this.globalAlpha,this.lineWidth,this.fillStyle,this.strokeStyle]);},restore(){[this.globalAlpha,this.lineWidth,this.fillStyle,this.strokeStyle]=stack.pop();},setTransform(){},beginPath(){path='';},moveTo(x,y){path+=`M ${f(x)} ${f(y)} `;},lineTo(x,y){path+=`L ${f(x)} ${f(y)} `;},quadraticCurveTo(a,b,x,y){path+=`Q ${f(a)} ${f(b)} ${f(x)} ${f(y)} `;},closePath(){path+='Z ';},ellipse(x,y,rx,ry,rot,a,b){for(let i=0;i<=36;i++){const t=a+(b-a)*i/36,px=Math.cos(t)*rx,py=Math.sin(t)*ry,X=x+px*Math.cos(rot)-py*Math.sin(rot),Y=y+px*Math.sin(rot)+py*Math.cos(rot);i?this.lineTo(X,Y):this.moveTo(X,Y);}},arc(x,y,r,a,b){this.ellipse(x,y,r,r,0,a,b);},fill(){svg+=`<path d="${path}" fill="${this.fillStyle}" opacity="${f(this.globalAlpha)}"/>`;},stroke(){svg+=`<path d="${path}" fill="none" stroke="${this.strokeStyle}" stroke-width="${f(this.lineWidth)}" opacity="${f(this.globalAlpha)}" stroke-linecap="round"/>`;},fillRect(x,y,w,h){svg+=`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${this.fillStyle}" opacity="${f(this.globalAlpha)}"/>`;}};return c;}
for(const [row,mode]of ['water','earth','fire','air'].entries())for(let col=0;col<3;col++){
 let seed=100+row;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const rec=C.resolveLoadout('elemental',[],null,{el:mode}),ps=new ParticleSystem({random:rnd,reduced:()=>false}),base=previewHandPx(340,300,rec.skin,rec.layers)[0];ps.setElement(mode);ps.setEmitters(rec.emitters);ps.setSand(rec.skin.sand);
 let hand;
 for(let i=0;i<60;i++){const dx=col===0?0:col===1?Math.max(-95,(i-59)*7):i<45?(i-30)*5:75-(i-45)*8;hand=base.map(p=>({...p,x:p.x+dx,y:p.y+(col?Math.sin(i*.2)*9:0)}));ps.update(1/30,[hand]);}
 svg+=`<g transform="translate(${col*360},${70+row*340})"><rect x="4" width="350" height="330" rx="12" fill="#0f172a"/><text x="14" y="25" fill="#e2e8f0" font-size="15">${mode} — ${['still','moving','reverse'][col]}</text>`;
 const parts=ps.partAlphas()?.[0]||{},visual=ps.visualHands([hand])[0];
 for(const step of P.rigPlan(visual,rec.skin,rec.layers,true))for(const shape of step.shapes){const a=shape.anim?P.animState(shape.anim,step.m,2):{m:step.m,k:1},alpha=parts[step.part]??1;svg+=`<path d="${esc(shape.d)}" transform="matrix(${a.m.map(f).join(' ')})" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${f(shape.opacity*a.k*alpha)}" stroke-linejoin="round"/>`;}
 const ctx=context();if(mode==='water')ps.material.drawWater(ctx,[visual]);drawParticles(ctx,ps.list);svg+='</g>';
}
svg+='</svg>\n';writeFileSync('artifacts/elemental-motion-review.svg',svg);console.log('Wrote artifacts/elemental-motion-review.svg; static states, not raster/device verification.');
