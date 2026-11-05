// Short-lived screen-space comic impacts, driven by motion or a stable change in extension.
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
export const comicWords=['POW','BOOM','ZAP','WHAM','BAM','WHOOSH','WOW','CRASH','KAPOW','SWISH'];
export const COMIC_LABELS=[...Array.from({length:11},(_,i)=>String(i)),...comicWords];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const center=hands=>{const pts=hands.flatMap(h=>[h[0],h[5],h[9],h[13],h[17]]);return{x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};};
export function comicLabels(count,time=0){const value=Number.isInteger(count)&&count>=0&&count<=10?String(count):'POW',word=comicWords[Math.floor(Math.max(0,time)/3.5)%comicWords.length];return[value,value===word?'BOOM':word];}
export class ComicMotion{
 constructor({reduced:rm=reduced}={}){this.reduced=rm;this.clear();}
 clear(){this.events=[];this.prev=null;this.lastCount=null;this.candidate=null;this.stable=0;this.hot=0;this.cooldown=0;this.sequence=0;}
 trigger(label,hands,w,h){
  if(this.reduced()||!hands?.length)return;
  const c=center(hands),sites=[[0.5,0.22],[0.24,0.6],[0.76,0.65],[0.5,0.82]];
  sites.sort((a,b)=>Math.hypot(b[0]*w-c.x,b[1]*h-c.y)-Math.hypot(a[0]*w-c.x,a[1]*h-c.y));
  const site=sites[this.sequence%2],text=COMIC_LABELS.includes(label)?label:comicWords[this.sequence%comicWords.length];
  this.events.push({s:text,x:Math.round(site[0]*1000),y:Math.round(site[1]*1000),age:0,life:0.9,tilt:(this.sequence%3-1)*0.08});
  this.events=this.events.slice(-2);this.sequence++;this.cooldown=0.65;this.hot=0;
 }
 update(hands,count,dt,w,h){
  dt=clamp(dt||0,0,0.1);this.cooldown=Math.max(0,this.cooldown-dt);
  this.events=this.events.filter(e=>(e.age+=dt)<e.life);
  if(this.reduced()){this.clear();return;}
  if(!hands?.length){this.prev=null;this.candidate=null;this.stable=0;return;}
  const c=center(hands),palm=Math.hypot(hands[0][5].x-hands[0][17].x,hands[0][5].y-hands[0][17].y)||1;
  const speed=this.prev&&dt>0?Math.hypot(c.x-this.prev.x,c.y-this.prev.y)/palm/dt:0;
  this.hot=speed>1.6?this.hot+dt:Math.max(0,this.hot-dt*2);this.prev=c;
  if(count!==this.candidate){this.candidate=count;this.stable=0;}else this.stable+=dt;
  if(this.lastCount===null)this.lastCount=count;
  if(this.stable>=0.12&&count!==this.lastCount){const opened=count>this.lastCount;this.lastCount=count;if(opened&&this.cooldown===0)this.trigger(String(count),hands,w,h);}
  if(this.hot>=0.07&&this.cooldown===0)this.trigger(null,hands,w,h);
 }
 snapshot(){return this.events.map(({s,x,y})=>({s,x,y}));}
 draw(ctx,w,h){drawComic(ctx,this.events,w,h);}
}
/** Draw only explicit active/snapshotted bursts. Quiet hand = no text. Positions never follow fingers. */
export function drawComic(ctx,events,w,h){
 if(!Array.isArray(events)||!events.length)return;
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 for(const e of events.slice(-2)){
  if(!COMIC_LABELS.includes(e.s))continue;
  const age=e.age||0,life=e.life||1,fade=e.life?Math.min(1,age/0.06)*clamp((life-age)/0.2,0,1):1;
  const pop=e.life?1+Math.sin(clamp(age/0.16,0,1)*Math.PI)*0.12:1;
  const bw=Math.min(w*0.82,440)*pop,bh=Math.min(h*0.35,200)*pop;
  const x=clamp(e.x/1000*w,bw/2+4,w-bw/2-4),y=clamp(e.y/1000*h,bh/2+4,h-bh/2-4);
  ctx.globalAlpha=fade;ctx.beginPath();
  for(let i=0;i<28;i++){const a=i*Math.PI/14+(e.tilt||0),k=i%2?0.77:1,px=x+Math.cos(a)*bw/2*k,py=y+Math.sin(a)*bh/2*k;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();
  ctx.fillStyle=e.s.length<=2?'#fde047':['#fb923c','#facc15','#f87171'][e.s.length%3];ctx.strokeStyle='#172033';ctx.lineWidth=4;ctx.fill();ctx.stroke();
  const size=Math.min(bh*0.76,bw*0.85/(e.s.length*0.62));ctx.font=`900 ${Math.round(size)}px Impact, sans-serif`;ctx.lineWidth=Math.max(3,size*0.06);ctx.strokeStyle='#172033';ctx.fillStyle='#ffffff';ctx.strokeText(e.s,x,y+2);ctx.fillText(e.s,x,y+2);
 }
 ctx.restore();
}
