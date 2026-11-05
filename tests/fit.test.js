import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser} from './harness.js';
import {makeHand,ALL,FAN} from './helpers.js';
installBrowser('?');
const C=await import('../js/cosmetics.js'),P=await import('../js/puppet.js');
const {cleanFit,FIT_DEFAULT,fitTips}=await import('../js/fit.js');
const {validPicture}=await import('../js/logic.js');
const {earthTiles}=await import('../js/element-body.js');
await C.loadCatalog();
const hand=makeHand(ALL,FAN).map(p=>({x:p.x*640,y:p.y*480})),norm=m=>Math.hypot(m[0],m[1]);
const plan=(fit)=>{const rec=C.resolveLoadout('cartoon',[{id:'longnails'}],null,{fit});return P.rigPlan(hand,rec.skin,rec.layers,true);};
test('finger fatness changes lateral widths and attached nail fitting while palm and joint positions stay independent',()=>{
 const before=JSON.stringify(hand),base=plan(FIT_DEFAULT),fat=plan({f:180,p:100,c:0});
 for(const step of base){const after=fat.find(s=>s.part===step.part);assert.ok(after);if(step.part==='palm')assert.deepEqual(after.m,step.m);else{assert.ok(Math.abs(norm(after.m)/norm(step.m)-1.8)<1e-9);assert.deepEqual(after.m.slice(2),step.m.slice(2),'length and mounts remain fixed');}}
 const wide=plan({f:100,p:150,c:0});for(const step of base){const other=wide.find(s=>s.part===step.part);if(step.part==='palm')assert.ok(Math.abs(norm(other.m)/norm(step.m)-1.5)<1e-9);else assert.deepEqual(other.m,step.m);}
 assert.equal(JSON.stringify(hand),before);
});
test('coverage expands edges and fingertips without modifying tracking, and defaults reproduce original geometry',()=>{
 const before=JSON.stringify(hand),base=plan(FIT_DEFAULT),cover=plan({f:100,p:100,c:10});
 assert.equal(fitTips(hand,FIT_DEFAULT),hand);
 for(const s of base){const m=cover.find(t=>t.part===s.part).m;assert.ok(norm(m)>norm(s.m));}
 const drawn=fitTips(hand,{f:100,p:100,c:10});assert.ok(Math.hypot(drawn[8].x-hand[7].x,drawn[8].y-hand[7].y)>Math.hypot(hand[8].x-hand[7].x,hand[8].y-hand[7].y));
 const original=earthTiles(hand),fat=earthTiles(hand,{f:180,p:100,c:0});assert.equal(original.length,fat.length);assert.ok(fat[20].points.some((p,i)=>p.x!==original[20].points[i].x));assert.equal(JSON.stringify(hand),before);
});
test('fit persists as bounded drawing metadata; receiver ignores its own preference and missing fields preserve old-phone defaults',()=>{
 const picture={view:'puppet',skin:'cartoon',hands:[],lm:null,ar:1.3,photo:''},fit={f:145,p:120,c:3};
 assert.ok(validPicture({...picture,fit},false));
 for(const bad of [[],{},'wide',{...fit,f:181},{...fit,p:69},{...fit,c:11},{...fit,c:1.5},{...fit,f:NaN},{...fit,path:'x'},{f:100,p:100}]){assert.equal(cleanFit(bad),null);assert.equal(validPicture({...picture,fit:bad},false),false);}
 C.setGen({fit});assert.deepEqual(C.genWire('cartoon').fit,fit);assert.deepEqual(C.resolveLoadout('robot',[]).skin.fit,fit);
 const incoming=C.resolveLoadout('cartoon',[],null,{fit:{f:80,p:90,c:0}});assert.deepEqual(incoming.skin.fit,{f:80,p:90,c:0});assert.equal(C.resolveLoadout('cartoon',[],null,{}).skin.fit,undefined);
 C.setGen({fit:{...fit,f:999}});assert.deepEqual(C.gen.fit,fit);C.setGen({fit:{...FIT_DEFAULT}});assert.equal(C.genWire('cartoon').fit,undefined);
});
