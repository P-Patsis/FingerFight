// Generic comic/element materials; ordinary validated rig paths, no branded characters.
export const ELEMENTS = ['water', 'fire', 'earth', 'air'];
export const cleanElement = e => ELEMENTS.includes(e) ? e : null;
const LEN = {thumb:[23,21,16.5],index:[26,20,15],middle:[30,22,16.5],ring:[27,20,15],pinky:[21,15,11.5]};
const HALF = {thumb:[8.5,8,7.4],index:[7,6.6,6.2],middle:[7.4,7,6.5],ring:[7,6.6,6.1],pinky:[6,5.6,5.2]};
const PALM='M 30 106 C 16 94 8 76 8 56 C 8 42 14 33 24 31 L 76 38 C 86 40 90 48 88 60 C 86 78 76 94 70 106 Z';
const cap=(w,L)=>`M ${-w} 0 L ${-w} ${-L} A ${w} ${w} 0 0 1 ${w} ${-L} L ${w} 0 A ${w} ${w} 0 0 1 ${-w} 0 Z`;
const dot=(x,y,r)=>`M ${x-r} ${y} A ${r} ${r} 0 1 0 ${x+r} ${y} A ${r} ${r} 0 1 0 ${x-r} ${y} Z`;
const stroke=(d,color,width=1,opacity=1,anim)=>({d,stroke:color,strokeWidth:width,opacity,...(anim?{anim}:{})});
function build(id,name,draw,category='fantasy',particles=[]) {
 const parts={palm:{ref:{wrist:[50,100],index:[20,38],pinky:[80,46]},shapes:draw(null,0,0)}};
 for(const [f,lengths] of Object.entries(LEN))lengths.forEach((L,i)=>{parts[f+'_'+['base','mid','tip'][i]]={length:L,shapes:draw(f,HALF[f][i],L,i)};});
 return {format:1,id,name,author:'Finger Fight',license:'CC0 (made for Finger Fight)',category,free:true,parts,overlays:[],particles};
}
export function comicJson(){
 return build('comic','Comic book',(f,w,L)=>f?[
  {d:cap(w,L),fill:'#f6c986',stroke:'#172033',strokeWidth:3.2},
  {d:`M ${w*.2} -2 L ${w*.72} -3 L ${w*.72} ${-L*.8} L ${w*.25} ${-L} Z`,fill:'#c97845',opacity:0.75},
  stroke(`M ${-w*.55} ${-L*.2} L ${-w*.55} ${-L*.72}`,'#fff4d6',1.5),
  stroke(`M ${-w*.65} ${-L*.45} Q 0 ${-L*.6} ${w*.55} ${-L*.45}`,'#172033',1.4),
 ]:[
  {d:PALM,fill:'#f6c986',stroke:'#172033',strokeWidth:3.7},
  {d:'M 72 43 Q 87 68 69 100 L 57 104 Q 72 73 62 46 Z',fill:'#c97845'},
  {d:Array.from({length:12},(_,i)=>dot(25+(i%3)*6,60+Math.floor(i/3)*7,1.1)).join(' '),fill:'#172033',opacity:0.4},
  stroke('M 22 54 Q 16 80 33 92 M 35 43 L 50 40','#fff4d6',2.5),
  stroke('M 31 63 Q 47 71 66 62 M 37 84 L 55 89','#172033',2),
 ],'human');
}
export function elementalJson(value='water'){
 const e=cleanElement(value)||'water';
 const pal={water:['#278bb8','#0b416b','#b9f5ff'],fire:['#c34b16','#69210e','#ffda68'],earth:['#9b7045','#453624','#d2bb86'],air:['#b5d9e5','#52849c','#f0fcff']}[e];
 const particles=e==='fire'?[{effect:'flame',color:'#f97316',where:'hand',rate:32},{effect:'flame',color:'#fde047',where:'tips',rate:26},{effect:'flame',color:'#fb923c',where:'palm',rate:22}]:e==='water'?[{effect:'bubbles',color:'#b9f5ff',where:'hand',rate:9}]:e==='earth'?[{effect:'grain',color:'#c9a675',where:'hand',rate:6}]:[{effect:'glow',color:'#d9f5ff',where:'hand',rate:3}];
 return build('elemental','Elemental',(f,w,L)=>{
  const base={d:f?cap(w,L):PALM,fill:pal[0],stroke:pal[1],strokeWidth:2.2,opacity:e==='air'?0.38:0.95};
  if(e==='earth')return [base,{d:f?`M ${-w} ${-L*.3} L ${w*.4} ${-L*.58} L ${w} ${-L*.2} L 0 -1 Z`:'M 14 59 L 40 39 L 61 66 L 38 88 Z M 58 78 L 80 61 L 73 97 L 47 103 Z',fill:pal[2],opacity:0.65},stroke(f?`M ${-w*.8} ${-L*.7} L 0 ${-L*.55} L ${w*.7} ${-L*.8}`:'M 22 76 L 37 65 L 49 76 L 65 64 M 41 91 L 55 84',pal[1],1.5)];
  const d=f?`M ${-w*.7} ${-L*.2} C ${w} ${-L*.4} ${-w} ${-L*.6} ${w*.55} ${-L*.83}`:'M 20 64 C 35 40 65 91 81 57 M 20 83 C 40 56 61 107 77 78';
  const lines=[base,stroke(d,pal[2],e==='air'?2.7:2,0.9,{drift:[0.4,0.6,e==='fire'?0.7:0.2,0]})];
  if(e==='fire')lines.push({d:f?`M ${-w*.6} ${-L*.5} Q ${-w} ${-L*.95} 0 ${-L*1.5} Q ${w*.8} ${-L} ${w*.5} ${-L*.5} Z`:'M 21 94 Q 18 70 34 53 Q 39 80 49 57 Q 55 35 64 46 Q 57 75 78 62 L 73 98 Z',fill:pal[2],opacity:0.85,anim:{pulse:[0.6,0.25,0]}});
  if(e==='air')lines.push(stroke(f?`M ${-w*.5} ${-L*.35} Q ${w*.75} ${-L*.6} ${-w*.1} ${-L*.8}`:'M 32 57 C 70 37 77 97 39 90 C 14 85 33 61 58 73',pal[2],1.3,0.8,{drift:[0.7,0.4,0.17,1.4]}));
  return lines;
 },'fantasy',particles);
}
