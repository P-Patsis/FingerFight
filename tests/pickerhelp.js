// Drives the in-app colour picker the way a finger does: tap the rainbow button, drag in the square, move the hue slider, tap Done.
export const panelOf = box => box.children.find(c => c.dataset?.act === 'panel');
export function openPicker(box) {
  if (!panelOf(box)) box.children.find(c => c.classList.contains('cprow')).children.find(x => x.dataset.act === 'any').onclick();
  const p = panelOf(box);
  return { panel: p, sv: p.children[0], hue: p.children[1], hex: () => p.children[2].children[1].textContent, done: () => panelOf(box).children[2].children[2].onclick(),
    drag: (x, y) => { const s = panelOf(box).children[0]; s.onpointerdown({ clientX: x, clientY: y, pointerId: 1 }); },
    setHue: v => { const h = panelOf(box).children[1]; h.value = String(v); h.oninput(); } };
}
