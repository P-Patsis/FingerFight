// Actual idle landmark/rig samples. SVG review, not a browser/phone screenshot.
import {writeFileSync} from 'node:fs';
import {installBrowser} from '../tests/harness.js';
installBrowser('?sim=1');
const {PreviewMotion}=await import('../js/preview-motion.js'),P=await import('../js/puppet.js'),C=await import('../js/cosmetics.js');
await C.loadCatalog();
const motion=new PreviewMotion();motion.sample(0);
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#0f172a"/>';
let geometry=svg;
const rec=C.resolveLoadout('cartoon',[]);
for(const [i,t]of [0,4600,5700,6500].entries()){
 if(i===3)motion.drag(100,10);
 const sample=motion.sample(t),hand=sample.lms[0].map(([x,y])=>({x:(x-100)*.27,y:(y-50)*.27}));
 const label=['Open','Charged fist','Release','Dragged rotation'][i];
 const start=`<g transform="translate(${i*300},25)"><text x="12" y="18" fill="white">${label}</text>`;
 svg+=start;geometry+=start;
 for(const step of P.rigPlan(hand,rec.skin,rec.layers,sample.backs[0]))for(const shape of step.shapes)svg+=`<path d="${shape.d}" transform="matrix(${step.m.join(' ')})" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}"/>`;
 for(const chain of [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]])geometry+=`<path d="${chain.map((n,j)=>`${j?'L':'M'}${hand[n].x} ${hand[n].y}`).join(' ')}" fill="none" stroke="#67e8f9" stroke-width="5"/>`;
 svg+='</g>';geometry+='</g>';
}
writeFileSync('artifacts/idle-preview-review.svg',svg+'</svg>');writeFileSync('artifacts/idle-preview-geometry.svg',geometry+'</svg>');
console.log('Exported actual rig SVG and geometry-only review (no phone screenshot).');
