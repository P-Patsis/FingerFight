// Vanish's learned background + temporal/feathered mask, clipped to locally tracked hands.
// Camera pixels never enter a game message. No extra model, timer, stream or full-resolution readback.
import { Engine } from './vanish-engine.js';
import { fitSize } from './vanish-bg.js';
export const CLOAK_SKINS = ['chameleon','ghost'];
export const CLOAK_INTERVAL = 100, CLOAK_SIDE = 160;
const CHAINS=[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
export function cloakPixels(engine, frame, mode, image) {
 const {alpha,model}=engine;let r=0,g=0,b=0,n=0;
 for(let i=0;i<alpha.length;i+=3)if(alpha[i]<10){const p=i*4;r+=frame[p];g+=frame[p+1];b+=frame[p+2];n++;}
 const fallback=n?[r/n,g/n,b/n]:[65,80,90];
 for(let i=0,p=0;i<alpha.length;i++,p+=4){
  for(let c=0;c<3;c++){
   const learned=model.n[i]?model.bg[p+c]:fallback[c];
   image[p+c]=mode==='ghost'?learned*0.8+[185,226,250][c]*0.2:learned;
  }
  image[p+3]=Math.round(alpha[i]*(mode==='ghost'?0.38:0.96));
 }
 return image;
}
export class CloakRenderer {
 constructor(){this.clear();}
 clear(){this.engine=null;this.source=null;this.mask=null;this.texture=null;this.last=-Infinity;this.error=null;this.image=null;this.raw=null;this.out=null;}
 ensure(width,height){
  const {w,h}=fitSize(width,height,CLOAK_SIDE);
  if(this.engine?.w===w&&this.engine?.h===h)return true;
  if(typeof document==='undefined')return false;
  const make=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  this.source=make();this.mask=make();this.texture=make();this.engine=new Engine(w,h);
  this.image=null;this.raw=new Uint8Array(w*h);this.out=new Uint8ClampedArray(w*h*4);this.last=-Infinity;
  return true;
 }
 update(video,hands,width,height,mode,now){
  if(!CLOAK_SKINS.includes(mode)||!video?.videoWidth||!this.ensure(width,height))return false;
  if(now-this.last<CLOAK_INTERVAL)return !!this.image;
  this.last=now;
  try{
   const {w,h}=this.engine,s=this.source.getContext('2d',{willReadFrequently:true}),m=this.mask.getContext('2d',{willReadFrequently:true});
   s.drawImage(video,0,0,w,h);const frame=s.getImageData(0,0,w,h);
   if(!(frame?.data instanceof Uint8ClampedArray))return false;
   m.clearRect(0,0,w,h);m.fillStyle='#ffffff';m.strokeStyle='#ffffff';m.lineJoin='round';m.lineCap='round';
   for(const hand of hands){
    const lm=hand.map(p=>({x:p.x*w/width,y:p.y*h/height})),palm=Math.hypot(lm[5].x-lm[17].x,lm[5].y-lm[17].y);
    m.beginPath();[0,1,2,5,9,13,17].forEach((id,i)=>i?m.lineTo(lm[id].x,lm[id].y):m.moveTo(lm[id].x,lm[id].y));m.closePath();m.fill();
    m.lineWidth=Math.max(2,palm*0.23);
    for(const ids of CHAINS){m.beginPath();ids.forEach((id,i)=>i?m.lineTo(lm[id].x,lm[id].y):m.moveTo(lm[id].x,lm[id].y));m.stroke();}
   }
   const mask=m.getImageData(0,0,w,h).data;for(let i=0;i<this.raw.length;i++)this.raw[i]=mask[i*4+3];
   this.engine.step(frame.data,this.raw,this.out);
   const t=this.texture.getContext('2d');this.image??=t.createImageData(w,h);
   cloakPixels(this.engine,frame.data,mode,this.image.data);t.putImageData(this.image,0,0);this.last=now;return true;
  }catch(e){this.error=e?.message||String(e);return false;}
 }
 draw(ctx,w,h,mirror=false){
  if(!this.image||!this.texture)return false;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);if(mirror){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(this.texture,0,0,w,h);ctx.restore();return true;
 }
}
