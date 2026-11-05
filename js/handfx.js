// Big generic comic bursts; count comes from existing tracking/message data, never from puppet geometry.
import { motionStyle } from './dynamics.js';
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
export const comicWords=['POW','BOOM','ZAP'];
export function comicLabels(count,time=0){
 const value=Number.isInteger(count)&&count>=0&&count<=10?String(count):'POW';
 const word=comicWords[Math.floor(Math.max(0,time)/3.5)%comicWords.length];
 return [value,value===word?'BOOM':word];
}
export function drawComic(ctx,hands,count,w,h,time=null){
 if(!hands?.length)return;
 const pts=hands.flat(),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),palm=Math.hypot(hands[0][5].x-hands[0][17].x,hands[0][5].y-hands[0][17].y);
 const moving=time!==null&&!reduced(),t=moving?time:0,amp=moving?motionStyle.strength/5:0;
 const labels=comicLabels(count,t),radius=Math.max(22,Math.min(62,palm*0.62,w*0.18,h*0.18));
 const bound=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const sites=[[Math.max(...xs)+radius*.4,Math.min(...ys)+radius*.5],[Math.min(...xs)-radius*.3,Math.min(...ys)+palm*1.1]];
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 labels.forEach((label,n)=>{
  const x=bound(sites[n][0],radius+4,w-radius-4),y=bound(sites[n][1]+Math.sin(t*2+n)*amp*3,radius+4,h-radius-4),rx=radius*(n?1.1:0.8),ry=radius*.68;
  ctx.beginPath();for(let i=0;i<24;i++){const a=i*Math.PI/12,k=i%2?0.73:1,px=x+Math.cos(a)*rx*k,py=y+Math.sin(a)*ry*k;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();
  ctx.fillStyle=n?'#fb923c':'#fde047';ctx.strokeStyle='#172033';ctx.lineWidth=3;ctx.fill();ctx.stroke();
  ctx.font=`900 ${Math.round(radius*(label.length>2?0.5:0.95))}px Impact, sans-serif`;ctx.lineWidth=3;ctx.strokeStyle='#172033';ctx.fillStyle='#ffffff';ctx.strokeText(label,x,y+1);ctx.fillText(label,x,y+1);
 });ctx.restore();
}
