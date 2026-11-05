// Standalone vector review and CPU-only timings; no browser/camera screenshot claim.
import {mkdirSync,writeFileSync} from 'node:fs';
import {installBrowser} from '../tests/harness.js';
installBrowser('?sim=1');globalThis.Path2D??=class{};
const C=await import('../js/cosmetics.js'),P=await import('../js/puppet.js'),D=await import('../js/dynamics.js');
const {previewHandPx}=await import('../js/avatars.js');const {drawComic,ComicMotion}=await import('../js/handfx.js');
const {ParticleSystem}=await import('../js/particles.js');const {Engine}=await import('../js/vanish-engine.js');const {cloakPixels}=await import('../js/cloak.js');
await C.loadCatalog();
const samples=[['Animal talons','cartoon',['claws']],['Long animal talons','cartoon',['longclaws']],['Five scissor blades','cartoon',['scissors']],['Knuckle claws','cartoon',['knuckleclaws']],['Nails: short','cartoon',['longnails'],{nl:1}],['Nails: long','cartoon',['longnails'],{nl:10}],['Hotdog: resting bends','floppy',[]],['Hotdog: moving springs','floppy',[],{moving:true}],['Comic: triggered WOW','comic',[]],...['water','fire','earth','air'].map(el=>['Elemental: '+el,'elemental',[],{el}]),['Chameleon: drawn preview','chameleon',[]],['Ghost: drawn preview','ghost',[]],['Paw: long claws','paw',[],{nl:10}]];
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),f=n=>Number(n.toFixed(4));
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="1300" viewBox="0 0 1040 1300"><rect width="100%" height="100%" fill="#080f20"/><text x="20" y="30" fill="#f8fafc" font-family="Arial,sans-serif" font-size="22">Finger Fight — new cosmetics review</text><text x="20" y="54" fill="#94a3b8" font-family="Arial,sans-serif" font-size="13">Static rig samples. Chameleon/Ghost camera compositing and physical feel need phone review.</text>';
for(const [i,[label,id,items,extra={}]]of samples.entries()){
 const rec=C.resolveLoadout(id,items.map(id=>({id})),null,{nl:5,fi:7,el:'water',...extra}),hand=previewHandPx(250,260,rec.skin,rec.layers)[0];let dyn=null;
 if(extra.moving){dyn=new D.HandDynamics({reduced:()=>false});for(let k=0;k<20;k++)dyn.update(hand,1/30,rec.skin,rec.layers);dyn.update(hand.map(p=>({...p,x:p.x+24})),1/30,rec.skin,rec.layers);}
 svg+=`<g transform="translate(${(i%4)*260+5},${75+Math.floor(i/4)*300})"><rect width="250" height="290" rx="12" fill="#0f172a"/><text x="10" y="23" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="13">${esc(label)}</text>`;
 for(const step of P.rigPlan(hand,rec.skin,rec.layers,true,dyn))for(const shape of step.shapes){const a=shape.anim?P.animState(shape.anim,step.m,1.6):{m:step.m,k:1};svg+=`<path d="${esc(shape.d)}" transform="matrix(${a.m.map(f).join(' ')})" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${f(shape.opacity*a.k)}" stroke-linejoin="round" stroke-linecap="round"/>`;}
 if(id==='comic'){
  let path='',font='';const ctx={globalAlpha:1,save(){},restore(){},setTransform(){},beginPath(){path='';},moveTo(x,y){path+=`M ${f(x)} ${f(y)} `;},lineTo(x,y){path+=`L ${f(x)} ${f(y)} `;},closePath(){path+='Z';},fill(){svg+=`<path d="${path}" fill="${this.fillStyle}"/>`;},stroke(){svg+=`<path d="${path}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}"/>`;},set font(v){font=v;},get font(){return font;},strokeText(t,x,y){svg+=`<text x="${f(x)}" y="${f(y)}" font-family="Impact,sans-serif" font-size="${parseInt(font.match(/\d+px/)[0])}" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}">${esc(t)}</text>`;},fillText(t,x,y){svg+=`<text x="${f(x)}" y="${f(y)}" font-family="Impact,sans-serif" font-size="${parseInt(font.match(/\d+px/)[0])}" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${this.fillStyle}">${esc(t)}</text>`;}};
  drawComic(ctx,[{s:'WOW',x:500,y:240}],250,260);
 }
 svg+='</g>';
}
svg+='</svg>\n';mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/expansion-review.svg',svg);console.log('Wrote artifacts/expansion-review.svg (static vector review).');
let calls=0;const ctx=new Proxy({}, {get:()=>()=>{calls++},set:()=>true});
for(const [id,items,extra]of [['floppy',[],{}],['comic',[],{}],['elemental',[],{el:'water'}],['elemental',[],{el:'fire'}],['elemental',[],{el:'earth'}],['elemental',[],{el:'air'}],['cartoon',['scissors','knuckleclaws'],{nl:10}],['ghost',[],{}],['chameleon',[],{}]]){
 const rec=C.resolveLoadout(id,items.map(id=>({id})),null,{nl:5,el:'water',fi:7,...extra}),base=previewHandPx(480,360,rec.skin,rec.layers)[0],ds=[new D.HandDynamics({reduced:()=>false}),new D.HandDynamics({reduced:()=>false})],ps=new ParticleSystem({reduced:()=>false});ps.setEmitters(rec.emitters);ps.setElement(id==='elemental'?extra.el:null);ps.setSand(rec.skin.sand);const comic=new ComicMotion({reduced:()=>false});let total=0;calls=0;
 for(let k=0;k<700;k++){const hands=[base.map(p=>({...p,x:p.x+Math.sin(k*.2)*12})),base],start=performance.now(),hd=hands.map((h,i)=>ds[i].update(h,1/30,rec.skin,rec.layers));ps.update(1/30,hands);ps.drawBackdrop(ctx);if(id==='elemental')ps.drawBody(ctx,hands);else P.drawPuppet(ctx,hands,rec.skin,rec.layers,[],ps.bodyAlphas(),hd,ps.partAlphas());if(id==='comic'){comic.update(hands,10,1/30,480,360);comic.draw(ctx,480,360);}ps.draw(ctx);if(k>=100)total+=performance.now()-start;}
 console.log(`${id}${extra.el?' '+extra.el:''}${items.length?' '+items.join('+'):''}: ${(total/600).toFixed(3)} ms/frame, two hands, JS only; ${Math.round(calls/700)} canvas calls/frame`);
}
const w=320,h=240,n=w*h,engine=new Engine(w,h),frame=new Uint8ClampedArray(n*4).fill(130),mask=new Uint8Array(n),out=new Uint8ClampedArray(n*4),texture=new Uint8ClampedArray(n*4);mask.fill(255,n*.3,n*.6);const material={};let total=0;
for(let k=0;k<350;k++){const start=performance.now();engine.step(frame,mask,out);cloakPixels(engine,frame,'chameleon',texture,{elapsed:4,dt:.1,state:material});if(k>=50)total+=performance.now()-start;}
console.log(`Vanish pixel math 320x240: ${(total/300).toFixed(3)} ms/update at <=10 updates/s; excludes canvas mask/readback/upload and GPU.`);
