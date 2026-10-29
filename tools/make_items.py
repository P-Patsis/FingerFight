#!/usr/bin/env python3
"""Writes the built-in cosmetic LAYER items (assets/items/*.json): tones, tattoos, nails, rings, gloves. The JSON files are the
assets; this script is only how they were drawn. A new item can be written by hand: see COSMETICS.md. Run: python3 tools/make_items.py
Shapes are in the base hand's part space (see SKINS.md): segments point up (-y) from their pivot; the palm is on a 0..100 grid."""
import json, os
from make_skins import LEN, HALF, PALM_D, circle

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'items')
FINGERS = list(LEN)
SEGS = ('base', 'mid', 'tip')
items = []

def item(id_, name, layer, category, parts=None, tint=None, free=True, unlock=None, particles=None):
    d = {'format': 1, 'id': id_, 'name': name, 'author': 'Finger Fight', 'license': 'CC0 (made for Finger Fight)', 'layer': layer, 'category': category}
    if not free: d['free'] = False; d['unlock'] = unlock or {'method': 'ad'}
    if parts: d['parts'] = parts
    if tint: d['tint'] = tint
    if particles: d['particles'] = particles
    items.append(d)

def w_of(f, i): return HALF[f][i]
def len_of(f, i): return LEN[f][i]

# ---- skin tone: ONE item with a colour picker. It recolours the cartoon hand's four skin colours (fill, outline, crease, nail line) from the
# picked colour (outline = darker, crease = a bit darker, nail line = lighter); other hands keep their own colours.
SWATCH_COLORS = ['#dc2626', '#f97316', '#facc15', '#22c55e', '#22d3ee', '#3b82f6', '#a855f7', '#ec4899', '#f8fafc', '#111827']
item('skintone', 'Skin tone', 'tone', 'human',
     tint={'default': '#e3ad7c', 'map': {'#f6c9a0': 'main', '#9a5b2e': 'dark', '#c98f5f': 'mid', '#e9b38a': 'light'},
           'swatches': ['#fbe3cf', '#f6c9a0', '#e3ad7c', '#b97a4b', '#7a4a2b', '#4a2c17', '#86b35a', '#bfe3f5', '#c4b5fd']})

# ---- tattoos / scars (each has a colour picker: the main ink colour is the picked one)
def tint1(main, more=None):
    return {'default': main, 'map': {main: 'main', **(more or {})}, 'swatches': SWATCH_COLORS}
def band_zigzag(w, y, h=3.2):                               # a zig-zag band across a finger
    n = 4; step = 2 * w / n
    pts = ' '.join(f'L {-w + step * k:.2f} {y - (h if k % 2 else 0):.2f}' for k in range(n + 1))
    return f'M {-w} {y} ' + pts
tribal = {'palm': [{'d': 'M 24 60 C 34 50 46 52 50 62 C 54 52 66 50 76 60 M 36 84 C 44 76 56 76 64 84', 'stroke': '#1f2937', 'strokeWidth': 2.6, 'opacity': 0.85}]}
for f in ('index', 'middle', 'ring', 'pinky'):
    tribal[f + '_base'] = [{'d': band_zigzag(w_of(f, 0) - 1, -len_of(f, 0) * 0.55), 'stroke': '#1f2937', 'strokeWidth': 2.2, 'opacity': 0.85}]
item('tribal', 'Tribal ink', 'tattoo', 'human', parts=tribal, tint=tint1('#1f2937'))
scar = {'palm': [{'d': 'M 30 44 L 74 90', 'stroke': '#b91c1c', 'strokeWidth': 2.6, 'opacity': 0.8},
                 {'d': 'M 38 46 L 34 54 M 48 56 L 44 64 M 58 66 L 54 74 M 68 76 L 64 84', 'stroke': '#7f1d1d', 'strokeWidth': 1.6, 'opacity': 0.8}],
        'index_mid': [{'d': f'M {-w_of("index", 1)} {-len_of("index", 1) * 0.7} L {w_of("index", 1)} {-len_of("index", 1) * 0.3}', 'stroke': '#b91c1c', 'strokeWidth': 2.4, 'opacity': 0.8}]}
item('scar', 'Battle scar', 'tattoo', 'human', parts=scar, tint=tint1('#b91c1c', {'#7f1d1d': 'dark'}))
runes = {'palm': [{'d': 'M 36 50 L 36 68 M 36 58 L 44 52 M 52 50 L 60 50 L 52 68 L 62 68 M 68 54 L 72 62 L 66 70', 'stroke': '#c084fc', 'strokeWidth': 2.6},
                  {'d': 'M 36 50 L 36 68 M 52 50 L 60 50 L 52 68 L 62 68', 'stroke': '#a855f7', 'strokeWidth': 6, 'opacity': 0.25}]}
for f in ('index', 'middle', 'ring', 'pinky'):
    runes[f + '_base'] = [{'d': f'M 0 {-len_of(f, 0) * 0.7} L 0 {-len_of(f, 0) * 0.25} M {-3} {-len_of(f, 0) * 0.5} L 3 {-len_of(f, 0) * 0.5}', 'stroke': '#c084fc', 'strokeWidth': 2}]
item('runes', 'Glowing runes', 'tattoo', 'fantasy', parts=runes, free=False, unlock={'method': 'ad'}, tint=tint1('#c084fc', {'#a855f7': 'dark'}),
     particles=[{'effect': 'glow', 'color': '#c084fc', 'where': 'palm', 'rate': 2}])

# ---- nail polish: ONE item with a colour picker (was red / black / neon): a rounded nail on each tip segment
parts = {}
for f in FINGERS:
    w, L = w_of(f, 2), len_of(f, 2)
    r = w * 0.62
    parts[f + '_tip'] = [{'d': f'M {-r} {-L - w * 0.2} L {-r} {-L + 0.5} Q 0 {-L + 4.5} {r} {-L + 0.5} L {r} {-L - w * 0.2} Q 0 {-L - w * 1.1} {-r} {-L - w * 0.2} Z',
                          'fill': '#dc2626', 'stroke': '#7f1d1d', 'strokeWidth': 1.1}]
item('nailpolish', 'Nail polish', 'nails', 'human', parts=parts, tint=tint1('#dc2626', {'#7f1d1d': 'dark'}))

# ---- rings: a band across a finger segment, optionally with a stone
def ring_on(f, seg, band, edge, stone=None):
    w = w_of(f, seg); L = len_of(f, seg); y = -L * 0.62
    shapes = [{'d': f'M {-w - 0.8} {y} L {w + 0.8} {y} L {w + 0.8} {y - 4} L {-w - 0.8} {y - 4} Z', 'fill': band, 'stroke': edge, 'strokeWidth': 1.2}]
    if stone: shapes.append({'d': circle(0, y - 2, 2.6), 'fill': stone, 'stroke': edge, 'strokeWidth': 1})
    return shapes
item('goldring', 'Gold ring', 'ring', 'human', parts={'ring_base': ring_on('ring', 0, '#facc15', '#a16207')})
item('silverring', 'Silver rings', 'ring', 'human', parts={'index_base': ring_on('index', 0, '#e2e8f0', '#64748b'), 'pinky_base': ring_on('pinky', 0, '#e2e8f0', '#64748b')})
item('ruby', 'Ruby ring', 'ring', 'fantasy', parts={'ring_base': ring_on('ring', 0, '#facc15', '#a16207', '#e11d48')}, free=False, unlock={'method': 'purchase', 'price': '0.49'},
     particles=[{'effect': 'glint', 'color': '#fecdd3', 'where': 'knuckles', 'rate': 2}])

# ---- gloves: a cover over every part, a little wider than the finger underneath; they sit above rings and nails by default (z 50)
def glove(id_, name, cat, fill, edge, detail, parts_only=None, cuff=True, **kw):
    parts = {'palm': [{'d': PALM_D, 'fill': fill, 'stroke': edge, 'strokeWidth': 3}]}
    if cuff: parts['palm'].append({'d': 'M 28 100 L 72 100', 'stroke': detail, 'strokeWidth': 5})
    parts['palm'].append({'d': 'M 32 60 L 68 64', 'stroke': detail, 'strokeWidth': 1.6, 'opacity': 0.8})
    for f in FINGERS:
        for i, seg in enumerate(SEGS):
            if parts_only and seg not in parts_only: continue
            w = w_of(f, i) + 1.6; L = len_of(f, i)
            parts[f'{f}_{seg}'] = [{'d': f'M {-w} 0 L {-w} {-L} A {w} {w} 0 0 1 {w} {-L} L {w} 0 A {w} {w} 0 0 1 {-w} 0 Z', 'fill': fill, 'stroke': edge, 'strokeWidth': 2.6}]
    item(id_, name, 'glove', cat, parts=parts, **kw)
glove('whiteglove', 'White glove', 'human', '#f8fafc', '#94a3b8', '#cbd5e1')
glove('leather', 'Leather glove', 'human', '#8b5a2b', '#3f2a14', '#5a3a1a', free=False, unlock={'method': 'ad'})
glove('fingerless', 'Fingerless glove', 'human', '#374151', '#111827', '#9ca3af', parts_only=('base',))
glove('knight', 'Knight glove', 'fantasy', '#cbd5e1', '#475569', '#fbbf24', free=False, unlock={'method': 'purchase', 'price': '0.99'},
      particles=[{'effect': 'glint', 'color': '#ffffff', 'where': 'knuckles', 'rate': 2}])

# ---- effects (particles only; each has a colour picker). The ids are the item ids; `effect` is the preset in js/particles.js
def effect(id_, name, cat, em, **kw):
    item(id_, name, 'effect', cat, particles=em, tint={'default': em[0]['color'], 'map': {em[0]['color']: 'main'}, 'swatches': SWATCH_COLORS}, **kw)
effect('sparkles', 'Sparkles', 'fantasy', [{'effect': 'glint', 'color': '#fde047', 'where': 'hand', 'rate': 6}])
effect('bubbles', 'Bubbles', 'human', [{'effect': 'bubbles', 'color': '#7dd3fc', 'where': 'hand', 'rate': 4}])
effect('glow', 'Glow', 'scifi', [{'effect': 'glow', 'color': '#38bdf8', 'where': 'palm', 'rate': 2.5}])
effect('embers', 'Embers', 'fantasy', [{'effect': 'embers', 'color': '#fb923c', 'where': 'tips', 'rate': 8}])
effect('electric', 'Electric', 'scifi', [{'effect': 'sparks', 'color': '#67e8f9', 'where': 'knuckles', 'rate': 5},
                                         {'effect': 'sparks', 'color': '#67e8f9', 'where': 'tips', 'trigger': 'snap', 'burst': 12}], free=False, unlock={'method': 'ad'})

os.makedirs(OUT, exist_ok=True)
for it in items:
    with open(os.path.join(OUT, it['id'] + '.json'), 'w') as fh:
        json.dump(it, fh, separators=(',', ':'))
        fh.write('\n')
with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
    json.dump({'items': [i['id'] for i in items]}, fh)
    fh.write('\n')
print('wrote', len(items), 'items')
