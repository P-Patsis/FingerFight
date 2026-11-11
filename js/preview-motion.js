import {statesToLandmarks} from './puppet.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const pose=open=>statesToLandmarks({thumb:open,index:open,middle:open,ring:open,pinky:open});
const open=pose(true),fist=pose(false);
// Decoration only. These landmarks never enter the detector, vote window or network snapshots.
export class PreviewMotion{
 constructor(){this.reset();}
 reset(){this.yaw=0;this.roll=0;this.started=null;this.moved=false;this.travel=0;}
 drag(dx,dy){this.yaw+=dx*.012;this.roll=clamp(this.roll+dy*.004,-.12,.12);this.travel=(this.travel||0)+Math.abs(dx)+Math.abs(dy);if(this.travel>3)this.moved=true;}
 consumeClick(){const moved=this.moved;this.moved=false;return moved;}
 sample(now,reduced=false){
  this.started??=now;const t=Math.max(0,(now-this.started)/1000),phase=t%8;
  const curl=reduced?0:phase<3?0:phase<3.8?smooth((phase-3)/.8):phase<5.3?1:1-smooth((phase-5.3)/.6);
  const yaw=this.yaw+(reduced?0:Math.sin(t*.7)*.035),roll=this.roll+(reduced?0:Math.sin(t*1.1)*.006),c=Math.cos(roll),s=Math.sin(roll);
  const project=p=>{const x=p[0]-330,y=p[1]-600,xx=x*Math.sign(Math.cos(yaw))*Math.max(.35,Math.abs(Math.cos(yaw))),yy=y+x*Math.sin(yaw)*.1;return[330+xx*c-yy*s,600+xx*s+yy*c];};
  const lms=[open.map((p,i)=>project([p[0]*(1-curl)+fist[i][0]*curl,p[1]*(1-curl)+fist[i][1]*curl]))];
  return{lms,fitLms:[open.map(project)],backs:[Math.cos(yaw)>=0],count:curl>.85?0:5,curl};
 }
}
export function bindPreviewDrag(canvas,motion,{enabled=()=>true,repaint=()=>{}}={}){
 let pointer=null,last=null;
 canvas.dataset.rotatePreview='true';canvas.setAttribute('aria-label',(canvas.getAttribute('aria-label')||'Puppet preview')+'. Drag to rotate');
 canvas.addEventListener('pointerdown',e=>{if(!enabled()||e.button>0)return;pointer=e.pointerId;last={x:e.clientX,y:e.clientY};motion.moved=false;motion.travel=0;canvas.setPointerCapture?.(pointer);});
 canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointer||!last)return;motion.drag(e.clientX-last.x,e.clientY-last.y);last={x:e.clientX,y:e.clientY};repaint();});
 const stop=e=>{if(e.pointerId===pointer){canvas.releasePointerCapture?.(pointer);pointer=null;last=null;}};
 canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
}
