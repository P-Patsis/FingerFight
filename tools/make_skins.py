#!/usr/bin/env python3
"""Writes the built-in puppet skins (assets/skins/*.json). The JSON files are the assets; this script is only how the three
built-in ones were drawn. A new skin can be written by hand or by any script: see SKINS.md. Run: python3 tools/make_skins.py"""
import json, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'skins')
# nominal segment lengths in skin units (palm width = 60): they match the neutral pose, the rig stretches them to the real hand
LEN = {'thumb': (23, 21, 16.5), 'index': (26, 20, 15), 'middle': (30, 22, 16.5), 'ring': (27, 20, 15), 'pinky': (21, 15, 11.5)}
HALF = {'thumb': (8.5, 8, 7.4), 'index': (7, 6.6, 6.2), 'middle': (7.4, 7, 6.5), 'ring': (7, 6.6, 6.1), 'pinky': (6, 5.6, 5.2)}
PALM_REF = {'wrist': [50, 100], 'index': [20, 38], 'pinky': [80, 46]}
PALM_D = 'M 30 106 C 16 94 8 76 8 56 C 8 42 14 33 24 31 L 76 38 C 86 40 90 48 88 60 C 86 78 76 94 70 106 Z'

def capsule(w, L):
    return f'M {-w} 0 L {-w} {-L} A {w} {w} 0 0 1 {w} {-L} L {w} 0 A {w} {w} 0 0 1 {-w} 0 Z'

def block(w, L):
    return f'M {-w} 0 L {-w} {-L} L {w} {-L} L {w} 0 Z'

def circle(cx, cy, r):
    return f'M {cx - r} {cy} A {r} {r} 0 1 0 {cx + r} {cy} A {r} {r} 0 1 0 {cx - r} {cy} Z'

def build(id_, name, author, palm_shapes, seg_shapes, overlays=(), **meta):
    parts = {'palm': {'ref': PALM_REF, 'shapes': palm_shapes}}
    for f in LEN:
        for i, seg in enumerate(('base', 'mid', 'tip')):
            parts[f'{f}_{seg}'] = {'length': LEN[f][i], 'shapes': seg_shapes(f, i, HALF[f][i], LEN[f][i])}
    return {'format': 1, 'id': id_, 'name': name, 'author': author, 'license': 'CC0 (made for Finger Fight)', 'parts': parts, 'overlays': list(overlays), **meta}

# ---- cartoon: warm skin, brown outline, knuckle creases
def cartoon_palm():
    return [{'d': PALM_D, 'fill': '#f6c9a0', 'stroke': '#9a5b2e', 'strokeWidth': 2.5},
            {'d': 'M 30 62 C 40 66 54 66 66 60', 'stroke': '#c98f5f', 'strokeWidth': 1.8}]
def cartoon_seg(f, i, w, L):
    shapes = [{'d': capsule(w, L), 'fill': '#f6c9a0', 'stroke': '#9a5b2e', 'strokeWidth': 2.5}]
    if i == 2: shapes.append({'d': f'M {-w * 0.45} {-L * 0.55} L {w * 0.45} {-L * 0.55}', 'stroke': '#e9b38a', 'strokeWidth': 1.5})   # a fingernail line
    return shapes

# ---- robot: grey plates, rivets at the joints
def robot_palm():
    return [{'d': PALM_D, 'fill': '#9aa5b1', 'stroke': '#3b4450', 'strokeWidth': 2.5},
            {'d': 'M 22 48 L 80 54 M 26 84 L 74 84', 'stroke': '#5b6674', 'strokeWidth': 1.6},
            {'d': circle(30, 44, 2.6) + circle(76, 50, 2.6) + circle(34, 94, 2.6) + circle(68, 94, 2.6), 'fill': '#e2e8f0', 'stroke': '#3b4450', 'strokeWidth': 1}]
def robot_seg(f, i, w, L):
    return [{'d': block(w, L), 'fill': '#aab4c0' if i != 1 else '#98a3af', 'stroke': '#3b4450', 'strokeWidth': 2.5},
            {'d': circle(0, -1, 2.3), 'fill': '#e2e8f0', 'stroke': '#3b4450', 'strokeWidth': 1}]

# ---- neon: dark hand with a glowing cyan outline (the glow is a wide soft stroke underneath: no blur filter, cheap on a phone)
def neon_palm():
    return [{'d': PALM_D, 'stroke': '#22d3ee', 'strokeWidth': 9, 'opacity': 0.3},
            {'d': PALM_D, 'fill': '#0b1220', 'stroke': '#67e8f9', 'strokeWidth': 2.2},
            {'d': 'M 30 62 C 40 66 54 66 66 60', 'stroke': '#22d3ee', 'strokeWidth': 1.4, 'opacity': 0.7}]
def neon_seg(f, i, w, L):
    return [{'d': capsule(w, L), 'stroke': '#22d3ee', 'strokeWidth': 9, 'opacity': 0.3},
            {'d': capsule(w, L), 'fill': '#0b1220', 'stroke': '#67e8f9', 'strokeWidth': 2.2}]

# ---- paw (animal): brown fur, dark pads, little pale claws
def paw_palm():
    return [{'d': PALM_D, 'fill': '#b9824f', 'stroke': '#6b4423', 'strokeWidth': 2.5},
            {'d': 'M 50 58 C 62 58 72 68 68 82 C 64 94 36 94 32 82 C 28 68 38 58 50 58 Z', 'fill': '#6b4423', 'stroke': '#4a2e17', 'strokeWidth': 1.5},
            {'d': 'M 24 50 L 30 58 M 40 44 L 44 54 M 60 46 L 58 56 M 74 52 L 68 60', 'stroke': '#8a5a32', 'strokeWidth': 1.4}]
def paw_seg(f, i, w, L):
    shapes = [{'d': capsule(w, L), 'fill': '#b9824f', 'stroke': '#6b4423', 'strokeWidth': 2.5}]
    if i == 2:
        shapes.append({'d': circle(0, -L * 0.45, w * 0.5), 'fill': '#6b4423'})
        shapes.append({'d': f'M {-2.6} {-L - w + 1.5} L 0 {-L - w - 6} L 2.6 {-L - w + 1.5} Z', 'fill': '#f1e6d0', 'stroke': '#6b4423', 'strokeWidth': 1})
    return shapes

# ---- dragon (fantasy): green scales, dark outline, red claws
def dragon_palm():
    return [{'d': PALM_D, 'fill': '#4d9a4a', 'stroke': '#1f4d2b', 'strokeWidth': 2.5},
            {'d': 'M 20 52 L 30 60 L 40 52 L 50 60 L 60 52 L 70 60 L 80 52 M 22 72 L 32 80 L 42 72 L 52 80 L 62 72 L 72 80', 'stroke': '#2f6b36', 'strokeWidth': 1.6}]
def dragon_seg(f, i, w, L):
    shapes = [{'d': capsule(w, L), 'fill': '#4d9a4a' if i != 1 else '#43873f', 'stroke': '#1f4d2b', 'strokeWidth': 2.5},
              {'d': f'M {-w * 0.6} {-L * 0.55} L 0 {-L * 0.3} L {w * 0.6} {-L * 0.55}', 'stroke': '#2f6b36', 'strokeWidth': 1.4}]
    if i == 2: shapes.append({'d': f'M {-3} {-L - w + 2} L 0 {-L - w - 8} L 3 {-L - w + 2} Z', 'fill': '#e11d48', 'stroke': '#7f1d1d', 'strokeWidth': 1})
    return shapes

# ---- gauntlet (premade whole hand): steel plates with gold trim and a glowing core
def gaunt_palm():
    return [{'d': PALM_D, 'fill': '#64748b', 'stroke': '#1e293b', 'strokeWidth': 3},
            {'d': 'M 22 46 L 80 52 M 24 90 L 76 90', 'stroke': '#fbbf24', 'strokeWidth': 2.4},
            {'d': circle(50, 70, 11), 'stroke': '#f59e0b', 'strokeWidth': 7, 'opacity': 0.3},
            {'d': circle(50, 70, 8), 'fill': '#fbbf24', 'stroke': '#92400e', 'strokeWidth': 1.6},
            {'d': circle(50, 70, 3.4), 'fill': '#fffbeb'}]
def gaunt_seg(f, i, w, L):
    return [{'d': block(w, L), 'fill': '#94a3b8' if i != 1 else '#7c8ba1', 'stroke': '#1e293b', 'strokeWidth': 2.8},
            {'d': f'M {-w} {-L * 0.5} L {w} {-L * 0.5}', 'stroke': '#fbbf24', 'strokeWidth': 2}]

# ---- golden hand (premade whole hand): polished gold with highlights
def gold_palm():
    return [{'d': PALM_D, 'fill': '#facc15', 'stroke': '#a16207', 'strokeWidth': 2.6},
            {'d': 'M 24 50 C 30 44 40 42 52 44', 'stroke': '#fef08a', 'strokeWidth': 2.4},
            {'d': 'M 30 62 C 40 66 54 66 66 60', 'stroke': '#ca8a04', 'strokeWidth': 1.8}]
def gold_seg(f, i, w, L):
    return [{'d': capsule(w, L), 'fill': '#facc15', 'stroke': '#a16207', 'strokeWidth': 2.6},
            {'d': f'M {-w * 0.45} {-L * 0.9} L {-w * 0.45} {-L * 0.25}', 'stroke': '#fef08a', 'strokeWidth': 1.8}]

def main():
    skins = [build('cartoon', 'Cartoon', 'Finger Fight', cartoon_palm(), cartoon_seg, category='human'),
             build('robot', 'Robot', 'Finger Fight', robot_palm(), robot_seg, category='scifi',
                   particles=[{'effect': 'sparks', 'color': '#fde68a', 'where': 'knuckles', 'rate': 4}]),
             build('neon', 'Neon', 'Finger Fight', neon_palm(), neon_seg, category='scifi',
                   tint={'default': '#22d3ee', 'map': {'#22d3ee': 'main', '#67e8f9': 'light'}, 'swatches': ['#ef4444','#f97316','#facc15','#22c55e','#22d3ee','#3b82f6','#a855f7','#ec4899','#f8fafc']}),
             build('paw', 'Paw', 'Finger Fight', paw_palm(), paw_seg, category='animal'),
             build('dragon', 'Dragon', 'Finger Fight', dragon_palm(), dragon_seg, category='fantasy', free=False, unlock={'method': 'ad'},
                   particles=[{'effect': 'embers', 'color': '#fb923c', 'where': 'tips', 'rate': 5}],
                   tint={'default': '#4d9a4a', 'map': {'#4d9a4a': 'main', '#43873f': 'mid', '#2f6b36': 'dark', '#1f4d2b': 'dark'}, 'swatches': ['#4d9a4a','#dc2626','#3b82f6','#a855f7','#facc15','#f97316','#64748b','#ec4899']}),
             build('gauntlet', 'Gauntlet', 'Finger Fight', gaunt_palm(), gaunt_seg, category='premade', whole=True,
                   particles=[{'effect': 'glow', 'color': '#f59e0b', 'where': 'palm', 'rate': 2.5},
                              {'effect': 'sparks', 'color': '#fde047', 'where': 'tips', 'trigger': 'snap', 'burst': 14}]),
             build('goldhand', 'Golden hand', 'Finger Fight', gold_palm(), gold_seg, category='premade', whole=True, free=False, unlock={'method': 'purchase', 'price': '0.99'},
                   particles=[{'effect': 'glint', 'color': '#fff7ae', 'where': 'hand', 'rate': 4}])]
    os.makedirs(OUT, exist_ok=True)
    for s in skins:
        with open(os.path.join(OUT, s['id'] + '.json'), 'w') as fh:
            json.dump(s, fh, indent=1)
            fh.write('\n')
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
        json.dump({'default': 'cartoon', 'skins': [s['id'] for s in skins]}, fh)
        fh.write('\n')
    print('wrote', [s['id'] for s in skins])

if __name__ == '__main__':
    main()
