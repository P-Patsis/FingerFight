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

def build(id_, name, author, palm_shapes, seg_shapes, overlays=()):
    parts = {'palm': {'ref': PALM_REF, 'shapes': palm_shapes}}
    for f in LEN:
        for i, seg in enumerate(('base', 'mid', 'tip')):
            parts[f'{f}_{seg}'] = {'length': LEN[f][i], 'shapes': seg_shapes(f, i, HALF[f][i], LEN[f][i])}
    return {'format': 1, 'id': id_, 'name': name, 'author': author, 'license': 'CC0 (made for Finger Fight)', 'parts': parts, 'overlays': list(overlays)}

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

skins = [build('cartoon', 'Cartoon', 'Finger Fight', cartoon_palm(), cartoon_seg),
         build('robot', 'Robot', 'Finger Fight', robot_palm(), robot_seg),
         build('neon', 'Neon', 'Finger Fight', neon_palm(), neon_seg)]
os.makedirs(OUT, exist_ok=True)
for s in skins:
    with open(os.path.join(OUT, s['id'] + '.json'), 'w') as fh:
        json.dump(s, fh, indent=1)
        fh.write('\n')
with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
    json.dump({'default': 'cartoon', 'skins': [s['id'] for s in skins]}, fh)
    fh.write('\n')
print('wrote', [s['id'] for s in skins])
