// The device's "reduce motion" setting is honoured by the effects module (read once at load, like the CSS media query).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.matchMedia = q => ({ matches: /reduce/.test(q) });
const fx = await import('../js/fx.js');

test('reduced motion is detected from the device setting', () => {
  assert.equal(fx.reducedMotion(), true);
});

test('with reduced motion the flash, shake, wipe and confetti do nothing; the CSS also switches the animations off', () => {
  const style = [];
  const root = { style: { setProperty: (...a) => style.push(a) }, classList: { add() { throw new Error('should not animate'); }, remove() {} }, append() { throw new Error('no wipe'); }, getBoundingClientRect: () => ({ width: 300, height: 600 }) };
  globalThis.document = { body: { append() {} }, createElement: () => ({ getContext: () => null, setAttribute() {}, style: {}, dataset: {} }), getElementById: () => null };
  fx.initFx(root);
  assert.doesNotThrow(() => { fx.flash(2); fx.shake(2); fx.wipe(); fx.confetti(); fx.rain(); });
  assert.deepEqual(style, [], 'no CSS variables were set for animation');
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*#game\.shake[\s\S]*animation: none/);
});
