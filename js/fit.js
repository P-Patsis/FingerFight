// Manual drawing fit. Never modify the tracking landmarks used for game rules.
export const FIT_DEFAULT=Object.freeze({f:100,p:100,c:0});
export const FIT_LIMITS=Object.freeze({f:[50,180],p:[70,150],c:[0,10]});
export function cleanFit(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||!Object.keys(value).every(k=>Object.hasOwn(FIT_LIMITS,k)))return null;
 for(const [k,[lo,hi]]of Object.entries(FIT_LIMITS))if(!Number.isInteger(value[k])||value[k]<lo||value[k]>hi)return null;
 return {f:value.f,p:value.p,c:value.c};
}
export const defaultFit=f=>!f||(f.f===100&&f.p===100&&f.c===0);
export const fitFactors=value=>{const f=cleanFit(value)||FIT_DEFAULT;return {finger:f.f/100,palm:f.p/100,margin:f.c/100};};
/** Expand a drawn palm sideways about its local wrist/knuckle axis; finger joints stay where detected. */
export function fitPalm(points,hand,value){
 const {palm,margin}=fitFactors(value),factor=palm+margin*2;if(factor===1)return points;
 const dx=hand[17].x-hand[5].x,dy=hand[17].y-hand[5].y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,c={x:(hand[5].x+hand[17].x)/2,y:(hand[5].y+hand[17].y)/2};
 return points.map(p=>{const side=((p.x-c.x)*ux+(p.y-c.y)*uy)*(factor-1);return {...p,x:p.x+side*ux,y:p.y+side*uy};});
}
/** Extend only drawn fingertips by the coverage margin. Return the original at the default for exact compatibility. */
export function fitTips(hand,value){
 const {margin}=fitFactors(value);if(!margin)return hand;
 const out=hand.map(p=>({...p})),w=Math.hypot(hand[5].x-hand[17].x,hand[5].y-hand[17].y);
 for(const i of [4,8,12,16,20]){const a=hand[i-1],b=hand[i],L=Math.hypot(b.x-a.x,b.y-a.y)||1;out[i].x+=(b.x-a.x)/L*w*margin;out[i].y+=(b.y-a.y)/L*w*margin;}
 return out;
}
