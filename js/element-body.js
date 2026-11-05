import { fitFactors, fitPalm, fitTips } from './fit.js';
// Procedural drawing geometry only. No tracked point is changed and no extra particles are allocated.
const chains=[[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]];
const names=['thumb','index','middle','ring','pinky'];
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const poly=(ctx,p)=>{ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();};
const smoothPoly=(ctx,pts)=>{ctx.beginPath();const last=pts.at(-1),first=pts[0];ctx.moveTo((last.x+first.x)/2,(last.y+first.y)/2);for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];ctx.quadraticCurveTo(p.x,p.y,(p.x+q.x)/2,(p.y+q.y)/2);}ctx.closePath();};
const palmOutline=(h,fit)=>{const w=palm(h),dx=h[17].x-h[5].x,dy=h[17].y-h[5].y,L=Math.hypot(dx,dy)||1;return fitPalm([{x:h[0].x-dx/L*w*.3,y:h[0].y-dy/L*w*.3},{x:h[0].x+dx/L*w*.3,y:h[0].y+dy/L*w*.3},h[17],h[13],h[9],h[5],h[2],h[1]],h,fit);};
const palm=h=>Math.hypot(h[5].x-h[17].x,h[5].y-h[17].y)||1;
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
/** Tiles are used by both the intact body and released chunks, so holes match their source rocks. */
export function earthTiles(h,fitValue){
 h=fitTips(h,fitValue);
 const out=[],fit=fitFactors(fitValue),w=palm(h),c=mix(h[0],h[9],.48),ring=palmOutline(h,fitValue);
 const add=(part,pts)=>{const id=out.length,x=pts.reduce((s,p)=>s+p.x,0)/pts.length,y=pts.reduce((s,p)=>s+p.y,0)/pts.length;out.push({id,part,x,y,points:pts.map(p=>({x:x+(p.x-x)*.93,y:y+(p.y-y)*.93})),tone:Math.floor(hash(id)*4)});};
 for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],A=mix(c,a,.45),B=mix(c,b,.45);add('palm',[c,A,B]);add('palm',[A,a,b,B]);}
 chains.forEach((chain,f)=>{for(let k=1;k<4;k++){const a=h[chain[k]],b=h[chain[k+1]],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,n={x:-dy/L,y:dx/L},part=names[f]+'_'+['base','mid','tip'][k-1];
  for(let t=0;t<2;t++){const A=mix(a,b,t*.5),B=mix(a,b,(t+1)*.5),r=w*((f===0?.14:.12)*(1-k*.08)*( .88+hash(f*20+k*2+t)*.18)*fit.finger+fit.margin);add(part,[{x:A.x+n.x*r*.65,y:A.y+n.y*r*.65},{x:A.x-n.x*r*.7,y:A.y-n.y*r*.7},{x:B.x-n.x*r,y:B.y-n.y*r},{x:B.x+n.x*r*.8,y:B.y+n.y*r*.8}]);}
 }});return out;
}
function ribbon(ctx,points,width,time,phase,fill,alpha,wave=1){
 const edges=[[],[]];
 for(let i=0;i<points.length;i++){
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,n={x:-dy/L,y:dx/L};
  const r=width*(1-i/(points.length+1)*.5)*(1+Math.sin(time*4-i*1.8+phase)*.16*wave),drift=Math.sin(time*3-i*1.5+phase)*width*.26*wave;
  for(let side=0;side<2;side++)edges[side].push({x:points[i].x+n.x*((side?-1:1)*r+drift),y:points[i].y+n.y*((side?-1:1)*r+drift)});
 }
 const contour=[...edges[0],...edges[1].reverse()];ctx.beginPath();ctx.moveTo((contour[0].x+contour.at(-1).x)/2,(contour[0].y+contour.at(-1).y)/2);
 for(let i=0;i<contour.length;i++){const p=contour[i],q=contour[(i+1)%contour.length];ctx.quadraticCurveTo(p.x,p.y,(p.x+q.x)/2,(p.y+q.y)/2);}ctx.closePath();ctx.globalAlpha=alpha;ctx.fillStyle=fill;ctx.fill();
}
export function drawElementBody(ctx,hands,mode,{time=0,states=[],particles=[],reduced=false,fit:fitValue}={}){
 if(!mode)return false;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.lineCap='round';ctx.lineJoin='round';
 hands.forEach((h,index)=>{
  if(mode!=='earth')h=fitTips(h,fitValue);
  const fit=fitFactors(fitValue),w=palm(h),state=states[index],speed=reduced?0:state?.speed||0,v=reduced?{x:0,y:0}:state?.v||{x:0,y:0},t=reduced?0:time;
  if(mode==='earth'){
   const colors=['#806348','#b29260','#69523a','#c2a67b'];
   for(const tile of earthTiles(h,fitValue)){
    const detached=particles.find(p=>p.kind==='stone'&&p.hand===index&&p.tile===tile.id),age=detached?detached.age/detached.life:0;
    ctx.globalAlpha=detached?1-Math.min(1,Math.sin(Math.PI*age)*2):1;ctx.fillStyle=colors[tile.tone];poly(ctx,tile.points);ctx.fill();
    const a=tile.points[0],b=tile.points[1];ctx.fillStyle='#ddcaa2';poly(ctx,[a,b,{x:tile.x,y:tile.y}]);ctx.globalAlpha*=.35;ctx.fill();ctx.globalAlpha=1;
   }return;
  }
  if(mode==='water'){
   const outline=palmOutline(h,fitValue);ctx.globalAlpha=.85;ctx.fillStyle='#087aaf';smoothPoly(ctx,outline);ctx.fill();ctx.fillStyle='#23bfd0';ctx.globalAlpha=.5;smoothPoly(ctx,outline.map(p=>mix(p,mix(h[0],h[9],.5),.18)));ctx.fill();
   for(let f=0;f<5;f++){const line=chains[f].slice(1).map(i=>h[i]);ribbon(ctx,line,w*((f===0?.145:.13)*fit.finger+fit.margin),t,f,'#0e94c4',.78,1+speed*.2);ribbon(ctx,line.map(p=>({x:p.x-w*.025,y:p.y})),w*(.08*fit.finger+fit.margin*.5),t,f+1,'#5ee4ed',.65);ribbon(ctx,line.map(p=>({x:p.x+w*.025,y:p.y})),w*.018,t,f+2,'#edffff',.85);}
   // Nested moving caustics wrap the palm instead of drawing straight bone lines.
   for(let k=0;k<4;k++){const a=mix(h[0],h[5],.25+k*.17),b=mix(h[0],h[17],.25+k*.17),c=mix(h[0],h[9],.5);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(c.x+Math.sin(t*3+k)*w*.18,c.y+Math.cos(t*2+k)*w*.12,b.x,b.y);ctx.strokeStyle=k%2?'#c2ffff':'#08689d';ctx.globalAlpha=.6;ctx.lineWidth=w*(k%2?.018:.045);ctx.stroke();}
   return;
  }
  if(mode==='fire'){
   ctx.globalAlpha=.9;ctx.fillStyle='#f46a0b';smoothPoly(ctx,palmOutline(h,fitValue));ctx.fill();
   for(let k=0;k<4;k++){const p=mix(h[0],mix(h[5],h[17],(k+.5)/4),.35),r=w*.17,tip=mix(h[0],h[9],.9);ctx.beginPath();ctx.moveTo(p.x-r,p.y);ctx.quadraticCurveTo(p.x-r*.8,p.y-w*.3,tip.x-v.x*.06+Math.sin(t*7+k)*w*.15,tip.y-w*.18);ctx.quadraticCurveTo(p.x+r,p.y-w*.2,p.x+r,p.y);ctx.closePath();ctx.globalAlpha=.55;ctx.fillStyle=k%2?'#ffdd5a':'#ff9c18';ctx.fill();}
   // Overlapping tapered tongues form the hand itself, with white-hot interiors and trailing tips.
   for(let f=0;f<5;f++){
    const line=chains[f].slice(1).map(i=>h[i]);ribbon(ctx,line,w*(.14*fit.finger+fit.margin),t,f,'#f34f0b',.85);ribbon(ctx,line,w*.065,t,f+2,'#ffcb35',.95);
    for(let k=0;k<4;k++)for(let layer=0;layer<2;layer++){
     const p=line[k],r=w*(layer?.055:.115),length=w*(.35+hash(f*13+k)*.45)*(1+Math.min(2,speed)*.3),side=Math.sin(t*9+f+k)*w*.08;
     const tip={x:p.x-v.x*.09+side,y:p.y-length-v.y*.045};ctx.beginPath();ctx.moveTo(p.x-r,p.y+r*.5);ctx.quadraticCurveTo(p.x-r+side,p.y-length*.45,tip.x,tip.y);ctx.quadraticCurveTo(p.x+r+side,p.y-length*.4,p.x+r,p.y+r*.5);ctx.closePath();ctx.globalAlpha=layer?.9:.7;ctx.fillStyle=layer?'#fff0a1':'#ff7b13';ctx.fill();
    }
   }return;
  }
  // Air has no painted glove: thin interrupted streamlines define its volume.
  for(let f=0;f<5;f++)for(let lane=0;lane<2;lane++){
   const line=chains[f].slice(1).map(i=>h[i]);ctx.beginPath();
   line.forEach((p,k)=>{const off=Math.sin(t*3-k+f+lane*2)*w*.05+(lane-.5)*w*.11; k?ctx.lineTo(p.x+off,p.y):ctx.moveTo(p.x+off,p.y);});ctx.globalAlpha=lane?.55:.25;ctx.strokeStyle=lane?'#e1fcff':'#8dbfd5';ctx.lineWidth=w*((lane?.018:.05)*fit.finger+fit.margin);ctx.stroke();
  }
 });ctx.restore();return true;
}
