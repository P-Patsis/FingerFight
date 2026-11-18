// Build-time geometry for launcher assets/review only; never part of hand tracking.
export function flattenPath(d){
 const t=d.match(/[MLCQAZ]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)||[];
 let i=0,cmd='',x=0,y=0,points=[],out=[];
 const add=(a,b)=>{points.push([a,b]);x=a;y=b;},flush=()=>{if(points.length)out.push(points);points=[];};
 while(i<t.length){
  if(/^[A-Z]$/.test(t[i]))cmd=t[i++];
  if(cmd==='Z'){if(points.length)add(...points[0]);flush();cmd='';continue;}
  const n={M:2,L:2,C:6,Q:4,A:7}[cmd];if(!n)throw new Error('Unsupported icon path command '+cmd);
  const v=t.slice(i,i+n).map(Number);if(v.length!==n||v.some(a=>!Number.isFinite(a)))throw new Error('Invalid icon path');i+=n;
  const sx=x,sy=y;
  if(cmd==='M'){flush();add(...v);cmd='L';}
  else if(cmd==='L')add(...v);
  else if(cmd==='C')for(let j=1;j<=24;j++){const u=j/24,s=1-u;add(s*s*s*sx+3*s*s*u*v[0]+3*s*u*u*v[2]+u*u*u*v[4],s*s*s*sy+3*s*s*u*v[1]+3*s*u*u*v[3]+u*u*u*v[5]);}
  else if(cmd==='Q')for(let j=1;j<=20;j++){const u=j/20,s=1-u;add(s*s*sx+2*s*u*v[0]+u*u*v[2],s*s*sy+2*s*u*v[1]+u*u*v[3]);}
  else{
   let [rx,ry,deg,large,sweep,ex,ey]=v;rx=Math.abs(rx);ry=Math.abs(ry);
   if(!rx||!ry){add(ex,ey);continue;}if(sx===ex&&sy===ey)continue;
   const phi=deg*Math.PI/180,c=Math.cos(phi),s=Math.sin(phi),dx=(sx-ex)/2,dy=(sy-ey)/2,px=c*dx+s*dy,py=-s*dx+c*dy;
   const stretch=px*px/(rx*rx)+py*py/(ry*ry);if(stretch>1){rx*=Math.sqrt(stretch);ry*=Math.sqrt(stretch);}
   const k=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(rx*rx*ry*ry-rx*rx*py*py-ry*ry*px*px)/(rx*rx*py*py+ry*ry*px*px)));
   const cxp=k*rx*py/ry,cyp=-k*ry*px/rx,cx=c*cxp-s*cyp+(sx+ex)/2,cy=s*cxp+c*cyp+(sy+ey)/2;
   const a=Math.atan2((py-cyp)/ry,(px-cxp)/rx);let delta=Math.atan2((-py-cyp)/ry,(-px-cxp)/rx)-a;
   if(sweep&&delta<0)delta+=2*Math.PI;if(!sweep&&delta>0)delta-=2*Math.PI;
   const steps=Math.max(4,Math.ceil(Math.abs(delta)/.10));
   for(let j=1;j<=steps;j++){const q=a+delta*j/steps,ax=rx*Math.cos(q),ay=ry*Math.sin(q);add(cx+c*ax-s*ay,cy+s*ax+c*ay);}x=ex;y=ey;
  }
 }
 flush();return out;
}
export const transformPoint=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
// A = rotate(left) * scale(sx,sy) * rotate(right). Signed sy preserves reflections.
export function decompose(m){
 const [a,b,c,d,tx,ty]=m,angle=.5*Math.atan2(2*(a*c+b*d),a*a+b*b-c*c-d*d),v=Math.cos(angle),w=Math.sin(angle);
 const u=a*v+c*w,z=b*v+d*w,sx=Math.hypot(u,z),left=Math.atan2(z,u),sy=(-Math.sin(left))*(-a*w+c*v)+Math.cos(left)*(-b*w+d*v);
 if(!(sx>1e-9)||!Number.isFinite(sy))throw new Error('Degenerate icon transform');
 return{left:left*180/Math.PI,right:-angle*180/Math.PI,sx,sy,tx,ty};
}
export function androidColor(color){
 if(!color||color==='none')return '#00000000';let h=color.slice(1);
 if(h.length===3||h.length===4)h=[...h].map(c=>c+c).join('');
 if(h.length===8)h=h.slice(6)+h.slice(0,6);
 if(!/^(?:[a-f0-9]{6}|[a-f0-9]{8})$/i.test(h))throw new Error('Unsupported icon colour');return '#'+h;
}
