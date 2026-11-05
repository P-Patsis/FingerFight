// Generic new cosmetics. Run after original generators/material polish; deterministic and idempotent.
import {readFileSync,writeFileSync} from 'node:fs';
import {comicJson,elementalJson} from '../js/special-skins.js';
const root=new URL('../assets/',import.meta.url);
const read=(folder,id)=>JSON.parse(readFileSync(new URL(`${folder}/${id}.json`,root),'utf8'));
const write=(folder,id,obj)=>writeFileSync(new URL(`${folder}/${id}.json`,root),JSON.stringify(obj,null,1)+'\n');
const LEN={thumb:[23,21,16.5],index:[26,20,15],middle:[30,22,16.5],ring:[27,20,15],pinky:[21,15,11.5]};
const HALF={thumb:[8.5,8,7.4],index:[7,6.6,6.2],middle:[7.4,7,6.5],ring:[7,6.6,6.1],pinky:[6,5.6,5.2]};
const shine=(phase=0)=>({pulse:[0.3,0.45,phase],drift:[0.15,0.25,0.14,phase]});
for(const id of ['claws','longclaws']){
 const item=read('items',id);item.parts={};item.fit=[];
 item.tint={default:'#e8dec3',map:{'#e8dec3':'main','#735637':'dark','#b89c72':'mid','#fff9e4':'light'},swatches:item.tint?.swatches||['#e8dec3','#ffffff','#946c40','#303030']};
 for(const [f,lengths]of Object.entries(LEN)){
  const L=lengths[2],w=HALF[f][2],reach=id==='claws'?18:78,tipX=w*1.05;
  item.parts[f+'_tip']=[
   {d:`M ${-w*.7} ${-L+2} C ${-w*.85} ${-L-reach*.4} ${w*.1} ${-L-reach*.88} ${tipX} ${-L-reach} C ${w*.25} ${-L-reach*.48} ${w*.75} ${-L-1} ${w*.65} ${-L+2} Q 0 ${-L+5} ${-w*.7} ${-L+2} Z`,fill:'#e8dec3',stroke:'#735637',strokeWidth:1.2},
   {d:`M ${w*.25} ${-L+1} Q ${-w*.05} ${-L-reach*.45} ${tipX*.9} ${-L-reach*.91} Q ${w*.2} ${-L-reach*.3} ${w*.6} ${-L+1} Z`,fill:'#b89c72',opacity:0.8},
   {d:`M ${-w*.32} ${-L-1} Q ${-w*.35} ${-L-reach*.5} ${tipX*.65} ${-L-reach*.83}`,stroke:'#fff9e4',strokeWidth:0.85,opacity:0.8,anim:shine(Object.keys(LEN).indexOf(f)*0.8)},
  ];item.fit.push({part:f+'_tip',x:tipX,y:-L-reach});
 }
 write('items',id,item);
}
const scissors=read('items','scissors');scissors.parts={};scissors.fit=[];
for(const [n,[f,lengths]]of Object.entries(Object.entries(LEN))){
 const L=lengths[2],w=HALF[f][2],reach=f==='thumb'?55:72,lean=(f==='thumb'?-1:0.25-Number(n)*0.12)*w;
 scissors.parts[f+'_mid']=[{d:`M ${-w*.95} -1 L ${w*.95} -1 L ${w*.85} ${-lengths[1]+1} L ${-w*.85} ${-lengths[1]+1} Z`,fill:'#65778b',stroke:'#243345',strokeWidth:1.3}];
 scissors.parts[f+'_tip']=[
  {d:`M ${-w*.85} ${-L+3} L ${-w*.78} ${-L-8} L ${lean-1.3} ${-L-reach+5} L ${lean} ${-L-reach} L ${lean+1.3} ${-L-reach+5} L ${w*.78} ${-L-8} L ${w*.85} ${-L+3} Z`,fill:'#cbd6e3',stroke:'#233247',strokeWidth:1.3},
  {d:`M 0 ${-L+2} L ${lean} ${-L-reach} L ${w*.78} ${-L-8} L ${w*.85} ${-L+3} Z`,fill:'#73869d'},
  {d:`M ${-w*.35} ${-L-3} L ${lean-.5} ${-L-reach+9}`,stroke:'#f7fdff',strokeWidth:1.3,anim:shine(Number(n)*0.7)},
  {d:`M ${-w} ${-L+4} L ${w} ${-L+4} L ${w} ${-L} L ${-w} ${-L} Z`,fill:'#34465b',stroke:'#9daebe',strokeWidth:0.8},
 ];scissors.fit.push({part:f+'_tip',x:lean,y:-L-reach});
}
write('items','scissors',scissors);
const knuckle={format:1,id:'knuckleclaws',name:'Knuckle claws',author:'Finger Fight',license:'CC0 (made for Finger Fight)',layer:'nails',category:'scifi',free:true,side:'both',nailAnchor:40,parts:{palm:[]},fit:[]};
for(const [n,x]of [31,50,69].entries()){
 const tip=x+(n-1)*8,y=-112-(n===1?8:0);
 knuckle.parts.palm.push({d:`M ${x-4} 43 L ${tip-2.2} ${y+14} L ${tip} ${y} L ${tip+2.2} ${y+14} L ${x+4} 43 Z`,fill:'#d5dfe9',stroke:'#27384d',strokeWidth:1.3},
  {d:`M ${x} 43 L ${tip} ${y} L ${tip+2.2} ${y+14} L ${x+4} 43 Z`,fill:'#71849b'},
  {d:`M ${x-1.8} 35 L ${tip-.5} ${y+12}`,stroke:'#f5fdff',strokeWidth:1.4,anim:shine(n*1.5)});
 knuckle.fit.push({part:'palm',x:tip,y});
}
knuckle.parts.palm.push({d:'M 24 40 L 76 40 L 74 49 L 26 49 Z',fill:'#45576e',stroke:'#172636',strokeWidth:1.5});
write('items','knuckleclaws',knuckle);
const hotdog=read('skins','floppy');hotdog.name='Hotdog fingers';hotdog.extend.spread=1;
const swaps={'#d9573b':'#d6a77a','#f8a58f':'#f0c89c','#7f1d1d':'#885338','#f5d0a0':'#bd8154'};
for(const part of Object.values(hotdog.parts))for(const shape of part.shapes)for(const key of ['fill','stroke'])if(swaps[shape[key]])shape[key]=swaps[shape[key]];
hotdog.tint.default='#d6a77a';hotdog.tint.map={'#d6a77a':'main','#f0c89c':'light','#885338':'dark','#bd8154':'mid'};
write('skins','floppy',hotdog);write('skins','comic',comicJson());write('skins','elemental',elementalJson());
for(const id of ['chameleon','ghost']){
 const skin=read('skins','cartoon');Object.assign(skin,{id,name:id==='ghost'?'Ghost':'Chameleon',category:'fantasy',free:true});delete skin.tint;
 for(const [name,part]of Object.entries(skin.parts)){
  const base={...part.shapes[0],fill:id==='ghost'?'#d8f2ff':'#9ec17d',stroke:id==='ghost'?'#a9ddf4':'#66834e',opacity:id==='ghost'?0.25:0.3,strokeWidth:1.6};
  const rim={...base,fill:'none',strokeWidth:id==='ghost'?5:2.5,opacity:0.13,anim:{drift:[id==='ghost'?2:0.6,-1,0.18,0]}};
  part.shapes=[base,rim];
  if(name==='palm')part.shapes.push({d:id==='ghost'?'M 22 70 Q 30 53 38 69 M 56 67 Q 64 52 72 68 M 35 87 Q 49 96 63 85':'M 22 53 L 35 47 L 45 56 L 58 49 L 75 58 M 25 75 L 39 66 L 52 78 L 69 70',stroke:id==='ghost'?'#ebfaff':'#c7dfa6',strokeWidth:2,opacity:0.65});
 }
 skin.overlays=[];skin.particles=id==='ghost'?[{effect:'glow',color:'#c0e9ff',where:'hand',rate:2}]:[];
 write('skins',id,skin);
}
for(const [folder,key,ids]of [['skins','skins',['comic','elemental','chameleon','ghost']],['items','items',['knuckleclaws']]]){
 const manifest=read(folder,'manifest');manifest[key]=[...new Set([...manifest[key],...ids])];write(folder,'manifest',manifest);
}
console.log('Generated animal talons, five scissor blades, knuckle claws, hotdog spread, comic/elemental/cloak hands.');
