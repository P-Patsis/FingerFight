// Local practice opponent. Chooses both values before seeing the player's answer; no network or camera access.
import {effectiveMax,effectiveMin,pointerFor} from './logic.js';
export const computerCount=(max,random=Math.random,min=0)=>Math.min(max,Math.max(min,min+Math.floor(random()*(max-min+1))));
export function computerHand(n){return Array.from({length:n>5?2:1},(_,h)=>Object.fromEntries(['thumb','index','middle','ring','pinky'].map((f,i)=>[f,h*5+i<n])));}
export class Computer{
 constructor({random=Math.random,skins=()=>['cartoon']}={}){this.random=random;this.skins=skins;this.round=null;this.skin=null;}
 start(){this.round=null;const ids=this.skins().filter(id=>/^[a-z]{1,12}$/.test(id));this.skin=ids[Math.min(ids.length-1,Math.floor(this.random()*ids.length))]||'cartoon';}
 begin(n,settings){if(!this.skin)this.start();const max=effectiveMax(settings,n),min=effectiveMin(settings,n);this.round={n,max,min,answer:computerCount(max,this.random,min),guess:computerCount(max,this.random,min),skin:this.skin};}
 picture(count){const hands=computerHand(count);return {view:'puppet',skin:this.round.skin,hands,lm:null,ar:1.333,photo:'',lay:[]};}
 message(){const r=this.round;if(!r)return null;return pointerFor(r.n)==='host'?{t:'guess',n:r.n,guess:r.guess,...this.picture(r.guess)}:{t:'reveal',n:r.n,count:r.answer,noHand:false,gesture:null,...this.picture(r.answer)};}
 clear(){this.round=null;this.skin=null;}
}
