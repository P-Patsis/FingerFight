// Scroll the screen to the sticky edge first, then the panel; hand unused distance back to the screen.
const clamp=(v,max)=>Math.max(0,Math.min(Math.max(0,max),v));
export function scrollSticky(panel,screen,delta){
 if(!Number.isFinite(delta)||!delta)return;
 const move=(node,amount)=>{const old=node.scrollTop||0;node.scrollTop=clamp(old+amount,node.scrollHeight-node.clientHeight);return node.scrollTop-old;};
 let left=delta;
 if(delta>0){const gap=Math.max(0,panel.getBoundingClientRect().top-screen.getBoundingClientRect().top);left-=move(screen,Math.min(left,gap));}
 left-=move(panel,left);
 if(left)move(screen,left);
}
const isControl=target=>!!target?.closest?.('input,textarea,select,.cp-sv');
export function bindStickyScroll(panel,fallbackScreen){
 if(!panel?.addEventListener)return;
 const screen=()=>panel.closest?.('.screen')||fallbackScreen;
 const active=()=>panel.id==='storeSticky'||panel.classList.contains('stuck');
 panel.addEventListener('wheel',e=>{
  if(!active()||e.ctrlKey||isControl(e.target)||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?screen().clientHeight:1);
  if(e.cancelable)e.preventDefault();scrollSticky(panel,screen(),delta);
 },{passive:false});
 let start=null,axis=null,routing=false;
 panel.addEventListener('touchstart',e=>{start=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;axis=null;routing=false;},{passive:true});
 panel.addEventListener('touchmove',e=>{
  if(!start||e.touches.length!==1||!active()||isControl(e.target))return;
  const touch=e.touches[0],dx=start.x-touch.clientX,dy=start.y-touch.clientY;
  if(!axis&&Math.max(Math.abs(dx),Math.abs(dy))<3)return;
  axis ||= Math.abs(dx)>Math.abs(dy)?'x':'y';start={x:touch.clientX,y:touch.clientY};
  if(axis==='x')return;
  const gap=panel.getBoundingClientRect().top-screen().getBoundingClientRect().top;
  if(!routing&&gap<=1)return; // Already pinned: keep native touch momentum and scroll chaining.
  routing=true;
  if(e.cancelable)e.preventDefault();scrollSticky(panel,screen(),dy);
 },{passive:false});
 panel.addEventListener('touchend',()=>{start=null;axis=null;routing=false;},{passive:true});
 panel.addEventListener('touchcancel',()=>{start=null;axis=null;routing=false;},{passive:true});
}
export function revealStickyControl(control){
 const panel=control?.closest?.('#stickyTop,#storeSticky'),screen=panel?.closest?.('.screen');
 if(!panel||!screen)return;
 const gap=Math.max(0,panel.getBoundingClientRect().top-screen.getBoundingClientRect().top);
 if(gap)scrollSticky(panel,screen,gap);
 const overflow=control.getBoundingClientRect().bottom-panel.getBoundingClientRect().bottom+8;
 if(overflow>0)scrollSticky(panel,screen,overflow);
}
