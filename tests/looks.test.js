// Saved looks: the whole getup under a name; apply, delete, survive a restart; validated again on load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowser, until } from './harness.js';

const b = installBrowser('?sim=1');
const $ = id => b.byId.get(id);
await import('../js/main.js');
const C = await import('../js/cosmetics.js');
const { Inventory } = await import('../js/inventory.js');
const { Looks, cleanLook, cleanName, sameGetup, MAX_LOOKS } = await import('../js/looks.js');
await C.loadCatalog();
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('a look is the WHOLE getup: hand + colour, worn items in order with colours and intensity, category colours, skeleton style and colour', () => {
  const inv = new Inventory(mem());
  inv.toggle('neon'); inv.setCategoryColor('base', '#ec4899');
  inv.toggle('whiteglove'); inv.toggle('goldring'); inv.toggle('nailpolish'); inv.setCategoryColor('nails', '#12ab34');
  inv.toggle('bubbles'); inv.setIntensity(8);
  const lk = new Looks(mem());
  const look = lk.add('Party', { ...inv.getup(), sk: '#e42525', ss: 'glow' });
  assert.equal(look.name, 'Party'); assert.equal(look.base, 'neon'); assert.equal(look.bc, '#ec4899');
  assert.deepEqual(look.lay.map(e => e.id), ['whiteglove', 'goldring', 'nailpolish', 'bubbles'], 'order kept');
  assert.equal(look.lay.find(e => e.id === 'nailpolish').c, '#12ab34'); assert.equal(look.lay.find(e => e.id === 'bubbles').k, 8);
  assert.deepEqual([look.sk, look.ss], ['#e42525', 'glow']); assert.equal(look.cat.nails.c, '#12ab34');
  // wear something else, then apply the look to a fresh inventory: everything is back
  const other = new Inventory(mem());
  other.toggle('robot'); other.toggle('scar');
  assert.equal(other.applyGetup(look), true);
  assert.equal(other.baseId, 'neon'); assert.equal(other.baseColor, '#ec4899');
  assert.deepEqual(other.stack.map(e => e.id), ['whiteglove', 'goldring', 'nailpolish', 'bubbles']);
  assert.equal(other.colorOf('nailpolish'), '#12ab34'); assert.equal(other.stack.find(e => e.id === 'bubbles').k, 8);
  assert.equal(other.categoryStyle('nails').c, '#12ab34');
  assert.ok(sameGetup(look, { ...other.getup(), sk: '#e42525', ss: 'glow' }), 'the same outfit is recognised'); assert.ok(!sameGetup(look, { ...other.getup(), sk: '#e42525', ss: 'bold' }));
});

test('applying never wears what is locked, unknown or a hand, and never exceeds the limit (storage may be hand-edited)', () => {
  const inv = new Inventory(mem());
  const bad = { base: 'dragon', bc: 'red', lay: [{ id: 'ruby' }, { id: 'nothere' }, { id: 'neon' }, { id: 'goldring', c: 'url(#a)' }, ...Array.from({ length: 30 }, (_, i) => ({ id: 'a' + String.fromCharCode(97 + i % 26) }))], cat: { nails: { c: 'blue' }, evil: 1 } };
  assert.equal(inv.applyGetup(bad), true);
  assert.equal(inv.baseId, 'cartoon', 'a locked hand is not worn'); assert.deepEqual(inv.stack.map(e => e.id), ['goldring']); assert.equal(inv.stack[0].color, null);
  assert.equal(inv.applyGetup(null), false); assert.equal(inv.applyGetup('x'), false);
});

test('looks are validated on load: bad ids, names with markup, bad colours and junk entries are cleaned or dropped; at most 12', () => {
  assert.equal(cleanName('<b>Hi</b> "x"'), 'bHi/b x', 'no markup characters survive');
  assert.equal(cleanName('a'.repeat(50)).length, 20);
  assert.equal(cleanLook({ id: 'ok1', name: 'A', base: 'neon', lay: [] }).name, 'A');
  for (const bad of [null, [], 'x', { id: 'BAD', name: 'A', base: 'neon' }, { id: 'ok', name: '', base: 'neon' }, { id: 'ok', name: 'A', base: 'Neon!' }, { id: 'ok', name: 'A' }]) assert.equal(cleanLook(bad), null, JSON.stringify(bad));
  const l = cleanLook({ id: 'ok', name: 'A', base: 'neon', bc: 'red', sk: '#12', ss: 'nope', lay: [{ id: 'goldring', c: 'blue' }], cat: { nails: { c: 'x' } } });
  assert.deepEqual([l.bc, l.sk, l.ss, l.lay[0].c], [undefined, undefined, undefined, undefined]);
  const st = mem();
  st.setItem('ff-looks', JSON.stringify([{ id: 'a1', name: 'One', base: 'neon', lay: [] }, { id: 'a1', name: 'Dup', base: 'neon', lay: [] }, 5, { id: 'zz', name: 'x', base: '!' },
    ...Array.from({ length: 30 }, (_, i) => ({ id: 'n' + i, name: 'L' + i, base: 'neon', lay: [] }))]));
  const lk = new Looks(st);
  assert.equal(lk.list.length, MAX_LOOKS); assert.equal(lk.list[0].name, 'One'); assert.ok(lk.list.every(x => /^[a-z0-9]{1,12}$/.test(x.id)));
  assert.equal(new Looks({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }).list.length, 0, 'blocked storage is not a crash');
  const full = new Looks(mem()); for (let i = 0; i < MAX_LOOKS; i++) assert.ok(full.add('x' + i, { base: 'neon', lay: [] })); assert.equal(full.add('one more', { base: 'neon', lay: [] }), null);
});

test('RESTART-PROOF: saved looks and the applied one come back after a reload', () => {
  const st = mem(), lk = new Looks(st);
  const a = lk.add('One', { base: 'neon', lay: [{ id: 'goldring' }] }), c = lk.add('Two', { base: 'robot', lay: [] });
  lk.markApplied(a.id);
  const back = new Looks(st);
  assert.deepEqual(back.list.map(l => l.name), ['One', 'Two']); assert.equal(back.appliedId, a.id);
  assert.equal(back.remove(c.id), true); assert.deepEqual(new Looks(st).list.map(l => l.name), ['One']);
  assert.equal(new Looks(st).remove('nothere'), false);
});

test('UI: the saved-looks row is inside the pinned block under the preview; Save look prompts for a name, tapping a look applies it, ✕ deletes it, and it survives a reload', async () => {
  const html = (await import('node:fs')).readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = id => html.indexOf('id="' + id + '"');
  assert.ok(at('stickyTop') < at('previewZone') && at('previewZone') < at('looksRow') && at('looksRow') < at('profileLayers'), 'under the preview, inside the sticky block');
  assert.ok(html.slice(at('stickyTop'), at('custArea')).includes('id="looksRow"'));
  $('profileBtn').onclick(); $('custBtn').onclick();
  await until(() => !$('custArea').hidden, 'customise open');
  assert.equal($('looksRow').hidden, false);
  const chip = v => $('profileLayers').children.find(x => x.dataset.value === v);
  chip('ring').onclick(); $('profileGrid').children.find(c => c.dataset.id === 'goldring').onclick();
  let asked = null; globalThis.prompt = (q, d) => { asked = q; return 'Gold <i>fan</i>'; };
  $('looksRow').children.find(x => x.dataset.act === 'save').onclick();
  assert.equal(asked, 'Name this look');
  const row = () => $('looksRow').children.filter(c => c.classList.contains('look'));
  assert.equal(row().length, 1); assert.equal(row()[0].children[0].textContent, 'Gold ifan/i', 'markup characters are stripped from the name');
  assert.ok(row()[0].classList.contains('sel'), 'the look in use is marked');
  assert.ok(JSON.parse(globalThis.localStorage.getItem('ff-looks'))[0].lay.some(e => e.id === 'goldring'), 'stored on the phone');
  // change the outfit, then tap the look: the ring is back and the look is marked again
  $('profileGrid').children.find(c => c.dataset.id === 'goldring').onclick();
  assert.ok(!JSON.parse(globalThis.localStorage.getItem('ff-stack')).some(e => e.id === 'goldring'));
  assert.ok(!row()[0].classList.contains('sel'), 'not marked once the outfit differs');
  row()[0].children.find(x => x.dataset.act === 'apply').onclick();
  assert.ok(JSON.parse(globalThis.localStorage.getItem('ff-stack')).some(e => e.id === 'goldring'), 'the look is applied');
  assert.ok(row()[0].classList.contains('sel'));
  assert.equal(globalThis.localStorage.getItem('ff-look'), row()[0].dataset.id, 'the applied look is remembered');
  // a cancelled prompt saves nothing
  globalThis.prompt = () => null; $('looksRow').children.find(x => x.dataset.act === 'save').onclick(); assert.equal(row().length, 1);
  // delete
  row()[0].children.find(x => x.dataset.act === 'delete').onclick();
  assert.equal(row().length, 0); assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('ff-looks')), []);
  delete globalThis.prompt;
  $('custDone').onclick(); $('profileBack').onclick();
});
