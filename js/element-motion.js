// Local drawing-only material response. Original tracking/counting landmarks are never edited.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ids=[0,5,9,13,17];
const center=h=>({x:ids.reduce((s,i)=>s+h[i].x,0)/5,y:ids.reduce((s,i)=>s+h[i].y,0)/5});
const width=h=>Math.hypot(h[5].x-h[17].x,h[5].y-h[17].y)||1;
export class ElementMotion{
 constructor(){this.clear();}
 clear(){this.states=[];this.time=0;}
 update(hands,dt){
  this.time+=dt;this.states.length=hands.length;
  hands.forEach((h,i)=>{
   const c=center(h),palm=width(h),s=this.states[i]??={prev:h.map(p=>({...p})),v:{x:0,y:0},speed:0,lag:h.map(()=>({x:0,y:0,vx:0,vy:0}))};
   const dx=dt?(c.x-center(s.prev).x)/dt:0,dy=dt?(c.y-center(s.prev).y)/dt:0,k=1-Math.exp(-dt*12);
   s.v.x+=(clamp(dx,-palm*8,palm*8)-s.v.x)*k;s.v.y+=(clamp(dy,-palm*8,palm*8)-s.v.y)*k;
   let energy=0;
   h.forEach((p,j)=>{const l=s.lag[j],vx=dt?(p.x-s.prev[j].x)/dt:0,vy=dt?(p.y-s.prev[j].y)/dt:0;energy+=Math.hypot(vx,vy)/21/palm;
    const tx=clamp(-vx*.065,-palm*.32,palm*.32),ty=clamp(-vy*.065,-palm*.32,palm*.32),steps=Math.max(1,Math.ceil(dt/.016)),t=dt/steps;
    for(let n=0;n<steps;n++){l.vx+=((tx-l.x)*90-l.vx*13)*t;l.vy+=((ty-l.y)*90-l.vy*13)*t;l.x+=l.vx*t;l.y+=l.vy*t;}
   });
   s.speed+=(Math.min(8,energy)-s.speed)*k;s.palm=palm;s.c=c;s.prev=h.map(p=>({...p}));
  });
 }
 deform(hands,mode){
  if(!['water','fire','air'].includes(mode))return hands;
  return hands.map((h,i)=>h.map((p,j)=>{
   const s=this.states[i];if(!s)return p;
   const l=s.lag[j],wave=Math.sin(this.time*5-j*.65),amp=s.palm*(mode==='water'?.018:.007)*(1+Math.min(2,s.speed));
   const gain=(mode==='water'?1:mode==='air'?.65:.22)*(mode==='water'?1-(s.charge||0)*.8:1);
   return {...p,x:p.x+l.x*gain+wave*amp*(mode==='water'?1-(s.charge||0)*.85:1),y:p.y+l.y*gain+Math.cos(this.time*4+j*.5)*amp*(mode==='water'?1-(s.charge||0)*.85:1)};
  }));
 }
 // Water has liquid currents on the body, not the air element's orbiting arcs.
 drawWater(ctx,hands){
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.lineCap='round';
  const chains=[[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]];
  hands.forEach((h,i)=>{const s=this.states[i];if(!s)return;
   for(let c=0;c<chains.length;c++)for(let lane=0;lane<2;lane++){
    const chain=chains[c],w=s.palm,phase=this.time*3+c*.8+lane*2.2;
    ctx.beginPath();
    for(let n=0;n<chain.length;n++){const p=h[chain[n]],offset=Math.sin(phase-n*1.4)*w*.045+(lane-.5)*w*.065;const x=p.x+offset,y=p.y+Math.cos(phase+n)*w*.025;n?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.globalAlpha=lane?.85:.48;ctx.strokeStyle=lane?'#e0ffff':'#087aa9';ctx.lineWidth=w*(lane?.018:.07);ctx.stroke();
   }
  });ctx.restore();
 }
}
