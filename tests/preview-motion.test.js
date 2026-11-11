import test from 'node:test';
import assert from 'node:assert/strict';
import {PreviewMotion,bindPreviewDrag} from '../js/preview-motion.js';
import {chargePose} from '../js/charge.js';
import {previewHandPx} from '../js/avatars.js';
import {ParticleSystem,MAX_PARTICLES} from '../js/particles.js';
test('idle preview curls to a fist, charges existing effects, then extends fingers and releases within the particle cap',()=>{
 const motion=new PreviewMotion(),ps=new ParticleSystem({reduced:()=>false});ps.setHandStyle('elemental');ps.setElement('water');let charged=false,released=false;
 for(let frame=0;frame<240;frame++){const pose=motion.sample(frame*1000/30),hands=previewHandPx(480,360,null,[],pose.lms);ps.update(1/30,hands);charged ||= ps.charge.states.some(s=>s?.charge>.8);released ||= ps.charge.states.some(s=>s?.released);assert.ok(ps.list.length+ps.swarmSize<=MAX_PARTICLES);}
 assert.ok(charged,'the authored fist genuinely satisfies charge detection');assert.ok(released,'extension releases the existing effect');
 assert.equal(chargePose(motion.sample(4500).lms[0].map(([x,y])=>({x,y}))).fist,true);
});
test('reduced motion keeps an open still pose; direct dragging rotates real landmark geometry and flips its face',()=>{
 const motion=new PreviewMotion(),a=motion.sample(0,true),b=motion.sample(4500,true);assert.deepEqual(a,b);motion.drag(180,12);const turned=motion.sample(4500,true);assert.notDeepEqual(turned.lms,a.lms);assert.equal(turned.backs[0],false);assert.equal(motion.consumeClick(),true);assert.equal(motion.consumeClick(),false);
});
test('preview drag captures only enabled pointer gestures and leaves the stored hand pose untouched',()=>{
 const events={},canvas={dataset:{},attrs:{},getAttribute(){return'Preview';},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){events[k]=fn;},setPointerCapture(){},releasePointerCapture(){}};
 const motion=new PreviewMotion();let repaint=0,enabled=false;bindPreviewDrag(canvas,motion,{enabled:()=>enabled,repaint:()=>repaint++});
 events.pointerdown({pointerId:1,clientX:0,clientY:0});events.pointermove({pointerId:1,clientX:30,clientY:0});assert.equal(repaint,0);
 enabled=true;events.pointerdown({pointerId:1,clientX:0,clientY:0});events.pointermove({pointerId:1,clientX:30,clientY:0});events.pointerup({pointerId:1});assert.equal(repaint,1);assert.ok(motion.yaw>0);motion.moved=false;motion.travel=0;for(let n=0;n<5;n++)motion.drag(1,0);assert.equal(motion.consumeClick(),true,'slow drags also suppress the painting click action');
});

test('opening another preview resets its face and framing; edge-on dragging cannot flatten the hand away',()=>{
 const motion=new PreviewMotion(),front=motion.sample(0,true);motion.drag(131,100);motion.sample(4500);
 const edge=motion.sample(4500,true),width=pose=>Math.max(...pose.lms[0].map(p=>p[0]))-Math.min(...pose.lms[0].map(p=>p[0]));
 assert.ok(width(edge)>width(front)*.3,'no vanishingly thin edge-on hand');motion.reset();
 assert.deepEqual(motion.sample(123456,true),front,'a fresh preview is front-facing and open regardless of previous clock/drag');
 for(let n=0;n<3000;n+=33){const pose=motion.sample(123456+n),hands=previewHandPx(480,360,null,[],pose.lms,'puppet',pose.fitLms);const xs=hands.flat().map(p=>p.x),ys=hands.flat().map(p=>p.y);assert.ok(Math.min(...xs)>0&&Math.max(...xs)<480);assert.ok(Math.min(...ys)>0&&Math.max(...ys)<360);assert.ok((Math.min(...xs)+Math.max(...xs))/2>230,'frontal hand remains centred');}
});
