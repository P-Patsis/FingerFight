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

def item(id_, name, layer, category, parts=None, recolor=None, free=True, unlock=None, particles=None, z=None):
    d = {'format': 1, 'id': id_, 'name': name, 'author': 'Finger Fight', 'license': 'CC0 (made for Finger Fight)', 'layer': layer, 'category': category}
    if not free: d['free'] = False; d['unlock'] = unlock or {'method': 'ad'}
    if z is not None: d['z'] = z
    if parts: d['parts'] = parts
    if recolor: d['recolor'] = recolor
    if particles: d['particles'] = particles
    items.append(d)

def w_of(f, i): return HALF[f][i]
def len_of(f, i): return LEN[f][i]

# ---- tones: remap the cartoon hand's four skin colours (fill, outline, crease, nail line); other hands keep their own colours
CARTOON = ('#f6c9a0', '#9a5b2e', '#c98f5f', '#e9b38a')
def tone(id_, name, cat, cols, **kw):
    item(id_, name, 'tone', cat, recolor=dict(zip(CARTOON, cols)), **kw)
tone('pale', 'Pale', 'human', ('#fbe3cf', '#b87a55', '#dcae8e', '#f2c9ad'))
tone('tan', 'Tan', 'human', ('#e3ad7c', '#8a4f26', '#bb7a49', '#d49c69'))
tone('brown', 'Brown', 'human', ('#b97a4b', '#6a3b1a', '#8e5a35', '#a66a3f'))
tone('deep', 'Deep', 'human', ('#7a4a2b', '#3e2110', '#5c3720', '#6a3f23'))
tone('orc', 'Orc green', 'fantasy', ('#86b35a', '#3f5f26', '#5f8a3c', '#719a48'), free=False, unlock={'method': 'ad'})
tone('frost', 'Frost blue', 'fantasy', ('#bfe3f5', '#4a7f9a', '#8ec3dc', '#a6d3e8'), free=False, unlock={'method': 'ad'})

# ---- tattoos / scars
def band_zigzag(w, y, h=3.2):                               # a zig-zag band across a finger
    n = 4; step = 2 * w / n
    pts = ' '.join(f'L {-w + step * k:.2f} {y - (h if k % 2 else 0):.2f}' for k in range(n + 1))
    return f'M {-w} {y} ' + pts
tribal = {'palm': [{'d': 'M 24 60 C 34 50 46 52 50 62 C 54 52 66 50 76 60 M 36 84 C 44 76 56 76 64 84', 'stroke': '#1f2937', 'strokeWidth': 2.6, 'opacity': 0.85}]}
for f in ('index', 'middle', 'ring', 'pinky'):
    tribal[f + '_base'] = [{'d': band_zigzag(w_of(f, 0) - 1, -len_of(f, 0) * 0.55), 'stroke': '#1f2937', 'strokeWidth': 2.2, 'opacity': 0.85}]
item('tribal', 'Tribal ink', 'tattoo', 'human', parts=tribal)
scar = {'palm': [{'d': 'M 30 44 L 74 90', 'stroke': '#b91c1c', 'strokeWidth': 2.6, 'opacity': 0.8},
                 {'d': 'M 38 46 L 34 54 M 48 56 L 44 64 M 58 66 L 54 74 M 68 76 L 64 84', 'stroke': '#7f1d1d', 'strokeWidth': 1.6, 'opacity': 0.8}],
        'index_mid': [{'d': f'M {-w_of("index", 1)} {-len_of("index", 1) * 0.7} L {w_of("index", 1)} {-len_of("index", 1) * 0.3}', 'stroke': '#b91c1c', 'strokeWidth': 2.4, 'opacity': 0.8}]}
item('scar', 'Battle scar', 'tattoo', 'human', parts=scar)
runes = {'palm': [{'d': 'M 36 50 L 36 68 M 36 58 L 44 52 M 52 50 L 60 50 L 52 68 L 62 68 M 68 54 L 72 62 L 66 70', 'stroke': '#c084fc', 'strokeWidth': 2.6},
                  {'d': 'M 36 50 L 36 68 M 52 50 L 60 50 L 52 68 L 62 68', 'stroke': '#a855f7', 'strokeWidth': 6, 'opacity': 0.25}]}
for f in ('index', 'middle', 'ring', 'pinky'):
    runes[f + '_base'] = [{'d': f'M 0 {-len_of(f, 0) * 0.7} L 0 {-len_of(f, 0) * 0.25} M {-3} {-len_of(f, 0) * 0.5} L 3 {-len_of(f, 0) * 0.5}', 'stroke': '#c084fc', 'strokeWidth': 2}]
item('runes', 'Glowing runes', 'tattoo', 'fantasy', parts=runes, free=False, unlock={'method': 'ad'},
     particles=[{'effect': 'glow', 'color': '#c084fc', 'where': 'palm', 'rate': 2}])

# ---- nail polish: a rounded nail on each tip segment
def nails(color, edge, id_, name, cat, **kw):
    parts = {}
    for f in FINGERS:
        w, L = w_of(f, 2), len_of(f, 2)
        r = w * 0.62
        parts[f + '_tip'] = [{'d': f'M {-r} {-L - w * 0.2} L {-r} {-L + 0.5} Q 0 {-L + 4.5} {r} {-L + 0.5} L {r} {-L - w * 0.2} Q 0 {-L - w * 1.1} {-r} {-L - w * 0.2} Z',
                              'fill': color, 'stroke': edge, 'strokeWidth': 1.1}]
    item(id_, name, 'nails', cat, parts=parts, **kw)
nails('#dc2626', '#7f1d1d', 'rednails', 'Red polish', 'human')
nails('#111827', '#000000', 'blacknails', 'Black polish', 'human', free=False, unlock={'method': 'ad'})
nails('#22d3ee', '#0e7490', 'neonnails', 'Neon polish', 'scifi', free=False, unlock={'method': 'ad'})

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

os.makedirs(OUT, exist_ok=True)
for it in items:
    with open(os.path.join(OUT, it['id'] + '.json'), 'w') as fh:
        json.dump(it, fh, separators=(',', ':'))
        fh.write('\n')
with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
    json.dump({'items': [i['id'] for i in items]}, fh)
    fh.write('\n')
print('wrote', len(items), 'items')
