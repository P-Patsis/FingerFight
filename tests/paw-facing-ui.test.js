import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until } from './harness.js';
import { makeHand, ALL, FAN } from './helpers.js';
const b=installBrowser('?sim=1'), $=id=>b.byId.get(id);
localStorage.setItem('ff-owned',JSON.stringify(['painting','flaming']));
const P=await import('../js/puppet.js'), C=await import('../js/cosmetics.js');
await C.loadCatalog();
const px=h=>h.map(p=>({x:p.x*640,y:p.y*480}));
const open=px(makeHand(ALL,FAN));
const mirror=h=>h.map(p=>({...p,x:640-p.x}));
const find=(n,act)=>n.dataset?.act===act?n:n.children?.map(c=>find(c,act)).find(Boolean);
const text=n=>[n.textContent,...(n.children||[]).map(text)].join(' ');

test('raw left/right palm fixtures hide nails on every hand; turned-over fixtures show them',()=>{
  const fixtures=[[open,'Left',false],[mirror(open),'Right',false],[mirror(open),'Left',true],[open,'Right',true]];
  for(const [hand,label,back] of fixtures){
    assert.equal(P.handBack(hand,label),back,`${label}: back=${back}`);
    for(const entry of C.catalog().filter(e=>e.kind==='base')){
      const rec=C.resolveLoadout(entry.id,[{id:'nailpolish'},{id:'longnails'}]);
      const plan=P.rigPlan(hand,rec.skin,rec.layers,P.handBack(hand,label));
      assert.equal(plan.some(s=>s.part.endsWith('@nailpolish')),back,entry.id+' polish');
      assert.equal(plan.some(s=>s.part.endsWith('@longnails')),back,entry.id+' long nails');
    }
  }
  const cartoon=C.resolveLoadout('cartoon',[]).skin;
  assert.ok(!P.rigPlan(open,cartoon,[],false).some(s=>s.shapes.some(shape=>shape.side==='back')));
  assert.equal(P.rigPlan(open,cartoon,[],true).filter(s=>s.shapes.some(shape=>shape.side==='back')).length,5);
  assert.throws(()=>P.parseShapes([{d:'M 0 0 L 1 1',side:'left'}],'bad'),/side/);
});

test('Paw claws extend independently with fingers, retract on a fist and follow longer-finger tips',()=>{
  const paw=C.resolveLoadout('paw',[]).skin, before=JSON.stringify(open);
  assert.equal(paw.overlays.length,5);
  const full=P.rigPlan(open,paw,[],true), claws=plan=>plan.filter(s=>s.part.endsWith('_tip+'));
  assert.equal(claws(full).length,5);
  assert.equal(claws(P.rigPlan(px(makeHand({})),paw,[],false)).length,0);
  const onlyIndex=px(makeHand({index:true}));
  assert.deepEqual(claws(P.rigPlan(onlyIndex,paw)).map(s=>s.part),['index_tip+']);
  const half=P.rigPlan(open,paw,[],true,{ext:{index:0.5}}).find(s=>s.part==='index_tip+');
  const straight=full.find(s=>s.part==='index_tip+');
  assert.ok(Math.hypot(half.m[2],half.m[3])<Math.hypot(straight.m[2],straight.m[3]));
  const long=C.resolveLoadout('paw',[{id:'longfingers'}]);
  const tip=P.extensionPieces(open,'index',P.activeExtend(long.skin,long.layers)).at(-1);
  const ext=P.rigPlan(open,long.skin,long.layers,true).find(s=>s.part==='index_tip+');
  assert.ok(Math.hypot(ext.m[4]-tip.a.x,ext.m[5]-tip.a.y)<1e-6);
  assert.equal(JSON.stringify(open),before);assert.equal(open.length,21);
});

test('category switches reset card and screen scrolling after rebuild; equipping preserves position',async()=>{
  await import('../js/main.js');$('storeBtn').onclick();
  await until(()=>$('storeGrid').children.length,'catalog');
  const oldRaf=globalThis.requestAnimationFrame, oldContext=$('storePreview').getContext, oldQuery=$('store').querySelector;
  const queue=[];globalThis.requestAnimationFrame=cb=>{queue.push(cb);return queue.length;};
  $('storePreview').getContext=()=>null;
  const flush=()=>{for(const cb of queue.splice(0))cb();};
  try{
    const g=$('storeGrid'),screen=$('store');
    g.getBoundingClientRect=()=>({top:-180,height:150});
    $('storeSticky').getBoundingClientRect=()=>({top:0,height:320});
    g.scrollLeft=120;g.scrollTop=240;screen.scrollTop=600;
    screen.getBoundingClientRect=()=>({top:0,height:600});
    screen.querySelector=selector=>selector==='.topbar'?{getBoundingClientRect:()=>({top:0,height:40})}:oldQuery.call(screen,selector);
    $('storeCats').getBoundingClientRect=()=>({top:100,height:35});
    $('storeLayers').children.find(c=>c.dataset.value==='nails').onclick();flush();
    assert.equal(g.scrollLeft,0);assert.equal(g.scrollTop,0);assert.equal(screen.scrollTop,92);
    assert.ok(g.children.every(c=>!c.dataset.id||c.classList.contains('locked')));
    assert.equal(screen.scrollTop,92,'rendering locked items does not change category alignment');
    $('storeBack').onclick();$('profileBtn').onclick();$('custBtn').onclick();flush();
    const profile=$('profile'),cards=$('profileGrid');
    profile.scrollTop=900;cards.scrollLeft=200;cards.scrollTop=40;
    profile.getBoundingClientRect=()=>({top:0,height:600});
    $('stickyTop').getBoundingClientRect=()=>({top:0,height:280});
    cards.getBoundingClientRect=()=>({top:-180,height:150});
    $('profileLayers').children.find(c=>c.dataset.value==='base').onclick();flush();
    assert.equal(cards.scrollLeft,0);assert.equal(cards.scrollTop,0);
    assert.equal(profile.scrollTop,432,'first new cards align immediately below sticky controls');
    cards.children.find(c=>c.dataset.id==='paw').onclick();flush();assert.equal(profile.scrollTop,432);
    $('custDone').onclick();$('profileBack').onclick();
  }finally{globalThis.requestAnimationFrame=oldRaf;$('storePreview').getContext=oldContext;$('store').querySelector=oldQuery;}
});

test('Painting and slider help paragraphs are removed while slider labels remain beside controls',()=>{
  $('profileBtn').onclick();$('custBtn').onclick();$('profileLayers').children.find(c=>c.dataset.value==='base').onclick();
  const card=id=>$('profileGrid').children.find(c=>c.dataset.id===id);
  card('painting').onclick();
  assert.doesNotMatch(text($('catColor')),/Tap Painting|0 = still|Reduced motion keeps/);
  assert.equal(find($('catColor'),'motion'),undefined);
  card('flaming').onclick();const fire=find($('catColor'),'fire');
  assert.equal(fire.parentElement.children[0].textContent,'Fire intensity');
  assert.equal(fire.tagName,'INPUT');
  $('profileBack').onclick();
});
