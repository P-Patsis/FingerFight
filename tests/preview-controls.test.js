import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installBrowser,until} from './harness.js';
import {openPicker} from './pickerhelp.js';
const b=installBrowser('?sim=1'),$=id=>b.byId.get(id);
await import('../js/main.js');
const find=(n,act)=>n.dataset?.act===act?n:n.children?.map(c=>find(c,act)).find(Boolean);
test('custom colour is the only toolbar icon and hand sizing shares its row and stays open during editing',async()=>{
 $('profileBtn').onclick();$('custBtn').onclick();await until(()=>$('profileGrid').children.length,'catalog');
 $('profileLayers').children.find(c=>c.dataset.value==='base').onclick();
 const row=()=>$('catColor').children.find(c=>c.classList.contains('cprow'));
 assert.equal(row().children[0].dataset.act,'any');assert.equal(row().children[1].tagName,'DETAILS');
 assert.equal(row().children[1].children[0].textContent,'Adjust Hand Size');
 assert.equal(row().children.some(c=>c.dataset.color),false);
 row().children[1].open=true;row().children[1].ontoggle();
 const input=find($('catColor'),'fit-f');input.value='135';input.oninput();input.onchange();
 assert.equal(JSON.parse(localStorage.getItem('ff-fit')).f,135);assert.equal(row().children[1].open,true);
 const p=openPicker($('catColor'));assert.equal(p.panel.children[2].children[3].textContent,'Original');p.done();
 $('profileBack').onclick();
});
test('preview actions are inside the viewer, Store preview/categories stick above a horizontal item row, and stack follows it',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8').replace(/<!--[\s\S]*?-->/g,'');
 const parents=new Map(),stack=[],voids=new Set(['meta','link','input','br','hr','img']);
 for(const m of html.matchAll(/<(\/?)([\w-]+)\b([^>]*?)>/g)){
  if(m[1]){const n=stack.map(x=>x.tag).lastIndexOf(m[2]);if(n>=0)stack.length=n;continue;}
  const id=m[3].match(/\bid="([^"]+)"/)?.[1];if(id)parents.set(id,stack.map(x=>x.id));
  if(!voids.has(m[2])&&!m[3].endsWith('/'))stack.push({tag:m[2],id});
 }
 for(const id of ['custBtn','tryBtn','tryNow','saveLookBtn','custDone'])assert.ok(parents.get(id).includes('pzRow'),id);
 for(const id of ['storeSnap','wearCamOff'])assert.ok(parents.get(id).includes('wearBox'),id);
 for(const id of ['wearSlotStore','storeCats','storeLayers'])assert.ok(parents.get(id).includes('storeSticky'),id);
 assert.ok(!parents.get('storeGrid').includes('storeSticky'));assert.ok(!parents.get('sWearList').includes('storeSticky'));
 assert.ok(html.indexOf('id="sWearList"')>html.indexOf('id="storeGrid"'));
 assert.match(html,/id="storeGrid" class="store-grid hrow items-row"/);
});
