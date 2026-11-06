// Drawing-only fist charge. Never alters tracking landmarks, match counts or network data.
const clamp=x=>Math.max(0,Math.min(1,x));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const chains=[[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
export function chargePose(hand){
 if(!Array.isArray(hand)||hand.length!==21||hand.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 let folded=0,extended=0;
 for(const c of chains){const length=dist(hand[c[0]],hand[c[1]])+dist(hand[c[1]],hand[c[2]])+dist(hand[c[2]],hand[c[3]]);
  if(length<1e-6)return null;const ratio=dist(hand[c[0]],hand[c[3]])/length;
  if(ratio<.6)folded++;if(ratio>.82)extended++;
 }
 const thumbLength=dist(hand[1],hand[2])+dist(hand[2],hand[3])+dist(hand[3],hand[4]);
 const thumbUp=thumbLength>1e-6&&dist(hand[1],hand[4])/thumbLength>.92&&dist(hand[4],hand[17])>dist(hand[3],hand[17])*1.08;
 return {fist:folded===4&&!thumbUp,open:extended>=1||thumbUp};
}
export function chargeTheme(skin,element){
 const mode=skin==='elemental'?element:skin;
 if(['fire','flaming','burnbone','dragon'].includes(mode))return{kind:'fire',color:'#ffac32',release:'flame'};
 if(mode==='water')return{kind:'ice',color:'#c4f8ff',release:'ice'};
 if(['earth','sand'].includes(mode))return{kind:mode,color:mode==='sand'?'#e7c484':'#b5a080',release:mode==='sand'?'grain':'stone'};
 if(mode==='air')return{kind:'air',color:'#d7faff',release:'gust'};
 if(mode==='floppy')return{kind:'elastic',color:'#ffd29d',release:'bubbles'};
 if(mode==='toybrick')return{kind:'brick',color:'#ffd65c',release:'stone'};
 if(mode==='lowpoly')return{kind:'crystal',color:'#8de4d7',release:'ice'};
 if(mode==='eyes')return{kind:'eyes',color:'#b8ee8e',release:'eye'};
 if(['frog','duck'].includes(mode))return{kind:'water',color:mode==='frog'?'#9ee7ad':'#ffdb79',release:'splash'};
 if(['robot','mechanical','cyberpunk','neon','gridmesh','gauntlet'].includes(mode))return{kind:'electric',color:mode==='cyberpunk'?'#f99df6':'#7deaff',release:'sparks'};
 if(['painting','inksketch','comic'].includes(mode))return{kind:'ink',color:mode==='painting'?'#f88fcb':mode==='comic'?'#ffe164':'#d4d8ed',release:'ink'};
 if(['ghost','chameleon'].includes(mode))return{kind:'veil',color:'#d5eeec',release:'ripple'};
 if(['paw','hook','bone'].includes(mode))return{kind:'claw',color:'#f7e9d0',release:'glint'};
 return{kind:'crystal',color:mode==='goldhand'?'#ffe39a':'#a7dcff',release:'glint'};
}
export class HandCharge{
 constructor(){this.clear();}
 clear(){this.states=[];this.time=0;}
 update(hands,dt){
  dt=Math.min(.1,Math.max(0,dt||0));this.time+=dt;this.states.length=Math.min(2,hands?.length||0);
  for(let i=0;i<this.states.length;i++){
   const h=hands[i],pose=chargePose(h);if(!pose){this.states[i]=null;continue;}
   const s=this.states[i]??={hold:0,openTime:0,charge:0,pulse:0,burst:0,armed:false};
   s.released=false;s.pulse=Math.max(0,s.pulse-dt/1.1);s.openTime=pose.open?s.openTime+dt:0;
   if(pose.fist){s.hold+=dt;if(s.hold>=.18){s.charge=clamp(s.charge+dt/.95);s.armed=true;}}
   else {s.hold=0;if(pose.open&&s.openTime>=.08&&s.armed){s.burst=s.charge;s.pulse=s.charge>=.22?1:0;s.released=s.charge>=.22;s.armed=false;s.charge=0;}else if(!pose.open)s.charge=Math.max(0,s.charge-dt*.2);}
   s.power=Math.max(s.charge,s.pulse*s.burst);s.holding=pose.fist;
   s.x=[0,5,9,13,17].reduce((n,j)=>n+h[j].x,0)/5;s.y=[0,5,9,13,17].reduce((n,j)=>n+h[j].y,0)/5;s.width=Math.max(1,dist(h[5],h[17]));
  }
 }
 draw(ctx,theme){
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.lineCap='round';ctx.strokeStyle=theme.color;
  for(const s of this.states){if(!s||s.power<.03)continue;const w=s.width;
   if(s.charge>.03){
    // Progress winds inward instead of a constant unrelated idle ring.
    for(let lane=0;lane<3;lane++){const angle=this.time*(lane%2?-2.2:2.8)+lane*2.1,r=w*(.82+lane*.13-s.charge*.22);
     ctx.globalAlpha=(.18+s.charge*.5)*(1-lane*.12);ctx.lineWidth=w*(lane===0?.025:.013);ctx.beginPath();ctx.arc(s.x,s.y,r,angle,angle+Math.PI*2*s.charge*.78);ctx.stroke();
    }
    if(theme.kind==='electric'||theme.kind==='crystal')for(let k=0;k<6;k++){
     const a=this.time*1.8+k*Math.PI/3,r=w*(.65+s.charge*.12);ctx.beginPath();ctx.moveTo(s.x+Math.cos(a)*r,s.y+Math.sin(a)*r);ctx.lineTo(s.x+Math.cos(a+.12)*r*.84,s.y+Math.sin(a+.12)*r*.84);ctx.lineTo(s.x+Math.cos(a+.2)*r*1.14,s.y+Math.sin(a+.2)*r*1.14);ctx.stroke();
    }
   }
   if(s.pulse>0){
    const age=1-s.pulse,r=w*(.7+age*2.9)*(.6+s.burst*.4);ctx.globalAlpha=s.pulse*.65*s.burst;ctx.lineWidth=w*.025*s.pulse;
    if(theme.kind==='elastic')for(let k=0;k<3;k++){ctx.beginPath();for(let j=0;j<15;j++){const x=s.x+(j/14-.5)*r*2,y=s.y+(k-1)*w*.2+Math.sin(j*.9-age*9)*w*.1*s.pulse;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
    else if(theme.kind==='claw')for(let k=-1;k<=1;k++){ctx.beginPath();ctx.moveTo(s.x-w*.6+k*w*.22,s.y+w*.4);ctx.lineTo(s.x+w*.25+k*w*.22,s.y-w*(.5+age));ctx.stroke();}
    else for(let lane=0;lane<2;lane++){ctx.beginPath();ctx.ellipse(s.x,s.y,r*(1+lane*.14),r*(.55+lane*.2),-age*.45,0,Math.PI*2);ctx.stroke();}
   }
  }ctx.restore();
 }
}
