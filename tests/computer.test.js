import test from 'node:test';
import assert from 'node:assert/strict';
import {Computer,computerCount} from '../js/computer.js';
import {DEFAULTS,validGuessMsg,validReveal} from '../js/logic.js';
import {Stats} from '../js/stats.js';
test('computer chooses uniformly across the inclusive finger range and commits before the human snap',()=>{
 for(let max=1;max<=10;max++)for(let n=0;n<=max;n++)assert.equal(computerCount(max,()=> (n+.5)/(max+1)),n);
 const values=[.99,.4,.9],c=new Computer({random:()=>values.shift()??0,skins:()=>['cartoon','robot']});c.begin(1,DEFAULTS);
 assert.equal(c.round.answer,2);assert.equal(c.round.guess,5);assert.equal(c.round.skin,'robot');assert.equal(c.message().guess,5);assert.deepEqual(c.message(),c.message(),'no adapting to a player answer');assert.ok(validGuessMsg(c.message(),false));
 const skin=c.round.skin;for(let n=2;n<=10;n++){c.begin(n,DEFAULTS);const m=c.message();assert.equal(m.skin,skin,'one puppet per match');if(n>=9){assert.ok((m.count??m.guess)>=1);}assert.ok(n%2?validGuessMsg(m,false):validReveal(m,false));assert.ok((m.count??m.guess)<=c.round.max);assert.equal(m.photo,'');}
 c.clear();assert.equal(c.message(),null);
});
test('practice statistics have a separate persistence key from player matches',()=>{
 const m=new Map(),storage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)},players=new Stats(storage),practice=new Stats(storage,'ff-practice-stats');
 players.recordMatch(true);practice.recordMatch(false);practice.recordShown(2);assert.equal(new Stats(storage).wins,1);assert.equal(new Stats(storage).losses,0);assert.equal(new Stats(storage,'ff-practice-stats').losses,1);assert.equal(new Stats(storage).shown[2],0);
});
