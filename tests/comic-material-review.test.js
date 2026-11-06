import test from 'node:test';
import assert from 'node:assert/strict';
import {ComicMotion} from '../js/handfx.js';
import {drawElementBody,earthTiles} from '../js/element-body.js';
import {makeHand,ALL,FAN} from './helpers.js';
const hand=makeHand(ALL,FAN).map(p=>({x:p.x*640,y:p.y*480}));
function recording(){const calls=[],ctx=new Proxy({}, {get:(t,k)=>k in t?t[k]:(...args)=>calls.push([k,...args]),set:(t,k,v)=>{t[k]=v;calls.push([k,v]);return true;}});return {ctx,calls};}
test('comic shows stable initial count, preserves count changes through word cooldown, including zero and ten',()=>{
 const c=new ComicMotion({reduced:()=>false}),step=(count,n=6)=>{for(let i=0;i<n;i++)c.update([hand],count,1/30,640,480);};
 step(5);assert.equal(c.events.at(-1).s,'5');step(5,40);assert.equal(c.events.length,0,'no constant labels');
 c.trigger('WOW',[hand],640,480);step(0);assert.equal(c.pendingCount,0);step(0,20);assert.equal(c.events.at(-1).s,'0');step(10,30);assert.equal(c.events.at(-1).s,'10');
 const palm=Math.hypot(hand[5].x-hand[17].x,hand[5].y-hand[17].y),center={x:[0,5,9,13,17].reduce((s,i)=>s+hand[i].x,0)/5,y:[0,5,9,13,17].reduce((s,i)=>s+hand[i].y,0)/5},e=c.events.at(-1);
 assert.ok(Math.hypot(e.x*.64-center.x,e.y*.48-center.y)<palm*1.5,'callout is near the palm, not in a distant screen corner');
});
test('comic counters selfie CSS mirroring for glyphs; photo and peer positions mirror once',()=>{
 const c=new ComicMotion({reduced:()=>false});c.trigger('POW',[hand],640,480);c.events[0].age=.2;
 const {ctx,calls}=recording();c.draw(ctx,640,480,{mirrorGlyphs:true});assert.ok(calls.some(a=>a[0]==='setTransform'&&a[1]===-1),'glyphs counter-reflected before CSS reflection');
 const raw=c.snapshot()[0],peer=c.snapshot(true)[0];assert.equal(peer.x,1000-raw.x);assert.deepEqual(Object.keys(peer),['s','x','y']);
 const normal=recording();c.draw(normal.ctx,640,480,{mirrorPositions:true});assert.ok(!normal.calls.some(a=>a[0]==='setTransform'&&a[1]===-1),'photo text is already upright');
 const fonts=calls.filter(a=>a[0]==='font').map(a=>parseInt(a[1].match(/\d+px/)[0]));assert.ok(fonts.every(n=>n<70&&n>=16));
});
test('materials render distinct native surfaces instead of a recoloured segmented glove, without changing landmarks',()=>{
 const before=JSON.stringify(hand),counts=[];
 for(const mode of ['water','earth','fire','air']){const {ctx,calls}=recording();assert.equal(drawElementBody(ctx,[hand],mode,{time:1,states:[{speed:3,v:{x:160,y:30}}]}),true);counts.push(calls.length);assert.ok(calls.every(c=>c[0]!=='drawImage'),'no camera pixels');if(mode==='air')assert.ok(!calls.some(c=>c[0]==='fill'),'air has no solid glove');else assert.ok(calls.some(c=>c[0]==='fill'));}
 assert.equal(new Set(counts).size,4);assert.equal(JSON.stringify(hand),before);
});
test('Earth chunks and source tiles share exact geometry, with individual tile holes and no whole-finger dissolve',()=>{
 const tiles=earthTiles(hand);assert.equal(tiles.length,46);assert.equal(new Set(tiles.map(t=>t.id)).size,46);
 const intact=recording();drawElementBody(intact.ctx,[hand],'earth');const broken=recording();drawElementBody(broken.ctx,[hand],'earth',{particles:[{kind:'stone',hand:0,tile:20,age:.5,life:1}]});
 assert.equal(intact.calls.filter(a=>a[0]==='fill').length,tiles.length*2);assert.equal(broken.calls.filter(a=>a[0]==='fill').length,(tiles.length-1)*2,'only the detached tile is omitted; other fingers remain solid');
 assert.ok(tiles.every(t=>t.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
});
