// Local practice opponent. Chooses both values before seeing the player's answer; no network or camera access.
import {effectiveMax,pointerFor} from './logic.js';
export const computerCount=(max,random=Math.random)=>Math.min(max,Math.max(0,Math.floor(random()*(max+1))));
export function computerHand(n){return Array.from({length:n>5?2:1},(_,h)=>Object.fromEntries(['thumb','index','middle','ring','pinky'].map((f,i)=>[f,h*5+i<n])));}
export class Computer{
 constructor({random=Math.random,skins=()=>['cartoon']}={}){this.random=random;this.skins=skins;this.round=null;}
 begin(n,settings){const max=effectiveMax(settings,n),ids=this.skins().filter(id=>/^[a-z]{1,12}$/.test(id));this.round={n,max,answer:computerCount(max,this.random),guess:computerCount(max,this.random),skin:ids[Math.min(ids.length-1,Math.floor(this.random()*ids.length))]||'cartoon'};}
 picture(count){const hands=computerHand(count);return {view:'puppet',skin:this.round.skin,hands,lm:null,ar:1.333,photo:'',lay:[]};}
 message(){const r=this.round;if(!r)return null;return pointerFor(r.n)==='host'?{t:'guess',n:r.n,guess:r.guess,...this.picture(r.guess)}:{t:'reveal',n:r.n,count:r.answer,noHand:false,gesture:null,...this.picture(r.answer)};}
 clear(){this.round=null;}
}
