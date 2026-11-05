import { fitFactors, fitPalm, fitTips } from './fit.js';
// Vanish's learned background + temporal/feathered mask, clipped to locally tracked hands.
// Camera pixels never enter a game message. No extra model, timer, stream or full-resolution readback.
import { Engine } from './vanish-engine.js';
import { fitSize } from './vanish-bg.js';
export const CLOAK_SKINS = ['chameleon','ghost'];
export const CLOAK_INTERVAL = 100, CLOAK_SIDE = 320;
const CHAINS=[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
/** Ghost uses actual learned pixels. Chameleon adapts coarse triangles through a slow sweep. */
export function cloakPixels(engine,frame,mode,image,{elapsed=4,dt=0.1,state={},reduced=false}={}){
 const {alpha,model,w,h}=engine;let r=0,g=0,b=0,n=0,minY=h,maxY=0,minX=w,maxX=0;
 for(let i=0;i<alpha.length;i++){
  if(alpha[i]<10&&i%3===0){const p=i*4;r+=frame[p];g+=frame[p+1];b+=frame[p+2];n++;}
  if(alpha[i]>30){const x=i%w,y=Math.floor(i/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 }
 if(mode==='ghost'){
  for(let i=0,p=0;i<alpha.length;i++,p+=4){image[p]=model.bg[p];image[p+1]=model.bg[p+1];image[p+2]=model.bg[p+2];image[p+3]=alpha[i];if(!model.n[i]){image[p]=frame[p];image[p+1]=frame[p+1];image[p+2]=frame[p+2];}}
  return image;
 }
 const fallback=n?[r/n,g/n,b/n]:[65,80,90],tile=Math.max(8,Math.round(w/22)),cols=Math.ceil(w/tile),rows=Math.ceil(h/tile),size=cols*rows*2;
 if(state.colors?.length!==size*3){state.colors=new Float32Array(size*3);state.initialized=new Uint8Array(size);}
 const phases=new Float32Array(size),spanY=Math.max(1,maxY-minY),spanX=Math.max(1,maxX-minX);
 for(let ty=0;ty<rows;ty++)for(let tx=0;tx<cols;tx++)for(let tri=0;tri<2;tri++){
  const k=(ty*cols+tx)*2+tri,x=Math.min(w-1,Math.floor((tx+(tri?0.7:0.3))*tile)),y=Math.min(h-1,Math.floor((ty+(tri?0.7:0.3))*tile)),i=y*w+x,p=i*4;
  const phase=clamp((maxY-y)/spanY*0.8+(x-minX)/spanX*0.2,0,1),mix=reduced?1:smooth((elapsed-phase*1.8)/1.2);phases[k]=mix;
  const gate=elapsed<3.1?mix:0.15+0.85*smooth((Math.sin(elapsed*1.3-phase*6.28)+1)/2);
  const follow=reduced?1:(1-Math.exp(-dt/0.65))*gate;
  for(let c=0;c<3;c++){
   const target=clamp(Math.round((model.n[i]?model.bg[p+c]:fallback[c])/40)*40*(tri?1.06:0.94),0,255),v=k*3+c;
   if(!state.initialized[k])state.colors[v]=elapsed>=3?target:frame[p+c];
   state.colors[v]+=(target-state.colors[v])*follow;
  }
  state.initialized[k]=1;
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,p=i*4,tri=(x%tile)+(y%tile)>tile?1:0,k=(Math.floor(y/tile)*cols+Math.floor(x/tile))*2+tri,mix=phases[k];
  for(let c=0;c<3;c++)image[p+c]=frame[p+c]*(1-mix)+state.colors[k*3+c]*mix;
  image[p+3]=alpha[i];
 }
 return image;
}
export class CloakRenderer {
 constructor(){this.clear();}
 clear(){this.engine=null;this.source=null;this.mask=null;this.texture=null;this.last=-Infinity;this.error=null;this.image=null;this.raw=null;this.out=null;this.material={};this.waveAge=0;this.emptyAge=0;this.side=CLOAK_SIDE;this.slow=0;}
 ensure(width,height){
  const {w,h}=fitSize(width,height,this.side);
  if(this.engine?.w===w&&this.engine?.h===h)return true;
  if(typeof document==='undefined')return false;
  const make=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const old=this.engine;
  this.source=make();this.mask=make();this.texture=make();this.engine=new Engine(w,h);
  if(old&&Math.abs(old.w/old.h-w/h)<0.03){
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=Math.min(old.h-1,Math.floor(y*old.h/h))*old.w+Math.min(old.w-1,Math.floor(x*old.w/w));this.engine.model.n[i]=old.model.n[j];for(let c=0;c<4;c++)this.engine.model.bg[i*4+c]=old.model.bg[j*4+c];}
  }
  this.material={};
  this.image=null;this.raw=new Uint8Array(w*h);this.out=new Uint8ClampedArray(w*h*4);this.last=-Infinity;
  return true;
 }
 update(video,hands,width,height,mode,now,fitValue){
  if(!CLOAK_SKINS.includes(mode)||!video?.videoWidth||!this.ensure(width,height))return false;
  if(now-this.last<CLOAK_INTERVAL)return !!this.image;
  const dt=Number.isFinite(this.last)?Math.min(0.25,Math.max(0,(now-this.last)/1000)):0;
  this.last=now;
  if(hands.length){this.waveAge+=dt;this.emptyAge=0;}else{this.emptyAge+=dt;if(this.emptyAge>0.5)this.waveAge=0;}
  const start=performance.now();
  try{
   const {w,h}=this.engine,s=this.source.getContext('2d',{willReadFrequently:true}),m=this.mask.getContext('2d',{willReadFrequently:true});
   s.drawImage(video,0,0,w,h);const frame=s.getImageData(0,0,w,h);
   if(!(frame?.data instanceof Uint8ClampedArray))return false;
   m.clearRect(0,0,w,h);m.fillStyle='#ffffff';m.strokeStyle='#ffffff';m.lineJoin='round';m.lineCap='round';
   for(const hand of hands){
    const fit=fitFactors(fitValue),lm=fitTips(hand.map(p=>({x:p.x*w/width,y:p.y*h/height})),fitValue),palm=Math.hypot(lm[5].x-lm[17].x,lm[5].y-lm[17].y);
    const outline=fitPalm([0,1,2,5,9,13,17].map(id=>lm[id]),lm,fitValue);
    m.beginPath();outline.forEach((p,i)=>i?m.lineTo(p.x,p.y):m.moveTo(p.x,p.y));m.closePath();m.fill();m.lineWidth=Math.max(2,palm*(0.18+fit.margin*2));m.stroke();
    m.lineWidth=Math.max(2,palm*(0.30*fit.finger+fit.margin*2));
    for(const ids of CHAINS){m.beginPath();ids.forEach((id,i)=>i?m.lineTo(lm[id].x,lm[id].y):m.moveTo(lm[id].x,lm[id].y));m.stroke();}
   }
   const mask=m.getImageData(0,0,w,h).data;for(let i=0;i<this.raw.length;i++)this.raw[i]=mask[i*4+3];
   this.engine.step(frame.data,this.raw,this.out);
   const t=this.texture.getContext('2d');this.image??=t.createImageData(w,h);
   cloakPixels(this.engine,frame.data,mode,this.image.data,{elapsed:this.waveAge,dt,state:this.material,reduced:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches});
   for(let i=0;i<this.raw.length;i++)this.image.data[i*4+3]=Math.min(this.image.data[i*4+3],this.raw[i]);
   t.putImageData(this.image,0,0);
   this.slow=performance.now()-start>14?this.slow+1:Math.max(0,this.slow-1);
   if(this.slow>=3&&this.side>160){this.side-=80;this.slow=0;}
   return true;
  }catch(e){this.error=e?.message||String(e);return false;}
 }
 draw(ctx,w,h,mirror=false){
  if(!this.image||!this.texture)return false;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);if(mirror){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(this.texture,0,0,w,h);ctx.restore();return true;
 }
}
