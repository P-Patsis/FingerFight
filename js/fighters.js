// Fighter artwork (inline SVG, animated by CSS classes in style.css) and the names of the five backgrounds.
// Nothing here uses player-supplied text, so it is safe to build with innerHTML.

export const BACKGROUNDS = ['Dojo', 'Neon Street', 'Rooftop Sunset', 'Volcano Arena', 'Space Station'];

export const GESTURE_NAMES = { middle: 'MIDDLE FINGER', sideways: 'SIDEWAYS BIRD' };

const STYLES = {
  host:  { gi: '#dc2626', trim: '#fca5a5', band: '#facc15', skin: '#f1c27d', hair: '#1f2937' },
  guest: { gi: '#2563eb', trim: '#93c5fd', band: '#f472b6', skin: '#d9a066', hair: '#111827' },
};

/** A front-facing kung-fu fighter. [side] picks the colours: 'host' = red gi, 'guest' = blue gi. */
export function fighterSVG(side) {
  const c = STYLES[side] || STYLES.host;
  return `
<svg class="fsvg" viewBox="0 0 120 172" aria-hidden="true">
  <ellipse class="shadow" cx="60" cy="168" rx="36" ry="5" fill="#0007"/>
  <g class="body">
    <g class="leg-l"><rect x="38" y="104" width="19" height="54" rx="8" fill="${c.gi}"/><rect x="35" y="150" width="24" height="13" rx="6" fill="#111827"/></g>
    <g class="leg-r"><rect x="63" y="104" width="19" height="54" rx="8" fill="${c.gi}"/><rect x="61" y="150" width="24" height="13" rx="6" fill="#111827"/></g>
    <g class="torso">
      <path d="M34 58 Q60 48 86 58 L92 112 Q60 122 28 112 Z" fill="${c.gi}"/>
      <path d="M48 54 L60 84 L72 54 Q60 60 48 54Z" fill="${c.trim}"/>
      <rect x="30" y="99" width="60" height="10" rx="3" fill="#111827"/>
    </g>
    <g class="arm-l"><rect x="13" y="60" width="17" height="46" rx="8.5" fill="${c.gi}"/><circle class="fist" cx="21.500" cy="110" r="12" fill="${c.skin}"/><rect x="13" y="96" width="17" height="6" fill="${c.trim}"/></g>
    <g class="arm-r"><rect x="90" y="60" width="17" height="46" rx="8.5" fill="${c.gi}"/><circle class="fist" cx="98.500" cy="110" r="12" fill="${c.skin}"/><rect x="90" y="96" width="17" height="6" fill="${c.trim}"/></g>
    <g class="head">
      <circle cx="60" cy="33" r="25" fill="${c.skin}"/>
      <path d="M35 28 Q38 6 60 7 Q82 6 85 28 Q72 16 60 18 Q48 16 35 28Z" fill="${c.hair}"/>
      <rect x="34" y="22" width="52" height="8" rx="3" fill="${c.band}"/>
      <path class="tail" d="M84 26 L108 18 L100 32 L110 38 L86 32Z" fill="${c.band}"/>
      <path class="brow" d="M43 37 L55 41 M77 37 L65 41" stroke="#111827" stroke-width="3.500" stroke-linecap="round"/>
      <circle class="eye" cx="49" cy="44" r="3" fill="#111827"/><circle class="eye" cx="71" cy="44" r="3" fill="#111827"/>
      <path class="mouth" d="M51 55 Q60 60 69 55" stroke="#7f1d1d" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;
}

/** The scenery for one of the five backgrounds. Extra shapes that CSS can't draw easily. */
export function backgroundHTML(index) {
  switch (index) {
    case 0: return `<div class="bg-layer dojo-wall"></div><div class="bg-layer dojo-banner">格闘</div><div class="bg-layer dojo-floor"></div>
      <div class="lantern l1"></div><div class="lantern l2"></div>`;
    case 1: return `<div class="bg-layer city-far"></div><div class="bg-layer city-near"></div>
      <div class="neon n1">FIGHT</div><div class="neon n2">拳</div><div class="bg-layer street"></div>`;
    case 2: return `<div class="bg-layer sun"></div><div class="bg-layer skyline"></div><div class="bg-layer tower"></div><div class="bg-layer roof"></div>`;
    case 3: return `<div class="bg-layer volcano"></div><div class="bg-layer lava"></div>
      ${Array.from({ length: 12 }, (_, i) => `<i class="ember" style="--i:${i}"></i>`).join('')}`;
    default: return `<div class="bg-layer stars"></div><div class="bg-layer planet"></div><div class="bg-layer grid-floor"></div>
      <div class="bg-layer window-frame"></div>`;
  }
}
