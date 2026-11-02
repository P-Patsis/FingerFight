#!/usr/bin/env python3
"""Skin content batch 1: eight base hands and three nail items, all generic styles (no character names or likenesses).
Writes assets/skins/<id>.json and assets/items/<id>.json and appends the ids to both manifests. Run: python3 tools/make_batch1.py
Uses the helpers (segment lengths, widths, palm reference) of make_skins.py so every hand rigs the same way."""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from make_skins import LEN, HALF, PALM_REF, PALM_D, capsule, block, circle, build

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
FINGERS = list(LEN)
SWATCH = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#22d3ee', '#3b82f6', '#a855f7', '#ec4899', '#f8fafc']
f2 = lambda v: f'{v:.2f}'.rstrip('0').rstrip('.')

def poly(pts):
    return 'M ' + ' L '.join(f'{f2(x)} {f2(y)}' for x, y in pts) + ' Z'

def gear(cx, cy, r, teeth=8, depth=None):
    depth = depth or r * 0.35
    pts = []
    for i in range(teeth):
        a = 2 * math.pi * i / teeth
        step = 2 * math.pi / teeth
        for off, rad in ((-0.28, r), (-0.16, r + depth), (0.16, r + depth), (0.28, r)):
            pts.append((cx + math.cos(a + off * step * 2) * rad, cy + math.sin(a + off * step * 2) * rad))
    return poly(pts)

def tint(default, mapping, swatches=SWATCH):
    return {'default': default, 'map': mapping, 'swatches': swatches}

# ---- 1. geometric / low-poly: straight edges only, two facets per piece
PALM_POLY = [(30, 106), (14, 90), (8, 56), (14, 36), (24, 31), (76, 38), (88, 48), (88, 62), (76, 92), (70, 106)]
def poly_palm():
    return [{'d': poly(PALM_POLY), 'fill': '#38bdf8', 'stroke': '#0369a1', 'strokeWidth': 2.2},
            {'d': poly([(8, 56), (14, 36), (24, 31), (50, 70), (14, 90)]), 'fill': '#7dd3fc'},
            {'d': poly([(50, 70), (76, 38), (88, 48), (88, 62), (76, 92), (70, 106), (30, 106)]), 'fill': '#0ea5e9'},
            {'d': 'M 24 31 L 50 70 L 76 38 M 14 90 L 50 70 L 76 92 M 30 106 L 50 70 L 70 106', 'stroke': '#0369a1', 'strokeWidth': 1.4}]
def poly_seg(f, i, w, L):
    cut = w * 0.55
    outline = [(-w, 0), (-w, -L + cut), (-w + cut, -L - cut * 0.4), (w - cut, -L - cut * 0.4), (w, -L + cut), (w, 0)]
    return [{'d': poly(outline), 'fill': '#0ea5e9' if i != 1 else '#38bdf8', 'stroke': '#0369a1', 'strokeWidth': 2},
            {'d': poly([(-w, 0), (-w, -L + cut), (-w + cut, -L - cut * 0.4), (0, -L), (0, 0)]), 'fill': '#7dd3fc'}]

# (The old per-finger web FINS are gone: frog and duck now carry a real membrane between neighbouring fingers, see the skin's "web" field.)

# ---- 2. frog: green, lighter belly, sticky round toe pads, webbing between the fingers
def frog_palm():
    return [
            {'d': PALM_D, 'fill': '#6dbf4b', 'stroke': '#2f6b36', 'strokeWidth': 2.5},
            {'d': circle(34, 74, 5) + circle(62, 66, 4) + circle(52, 88, 3.5), 'fill': '#4f9a3b'},
            {'d': 'M 30 62 C 40 66 54 66 66 60', 'stroke': '#a7e07f', 'strokeWidth': 2}]
def frog_seg(f, i, w, L):
    s = [{'d': capsule(w, L), 'fill': '#6dbf4b', 'stroke': '#2f6b36', 'strokeWidth': 2.5}]
    if i == 2: s.append({'d': circle(0, -L - 0.5, w * 1.35), 'fill': '#a7e07f', 'stroke': '#2f6b36', 'strokeWidth': 2.2})
    else: s.append({'d': f'M {-w * 0.5} {-L * 0.5} L {w * 0.5} {-L * 0.5}', 'stroke': '#a7e07f', 'strokeWidth': 1.5})
    return s

# ---- 3. duck: yellow feathers, bill-orange tips and webbing, little feather tufts at the wrist
def duck_palm():
    tufts = 'M 26 104 Q 30 112 36 104 Q 42 114 48 104 Q 54 114 60 104 Q 66 112 72 104'
    return [
            {'d': PALM_D, 'fill': '#fcd34d', 'stroke': '#b45309', 'strokeWidth': 2.5},
            {'d': tufts, 'fill': '#fde68a', 'stroke': '#b45309', 'strokeWidth': 1.8},
            {'d': 'M 28 58 Q 36 52 44 58 M 48 62 Q 56 56 64 62 M 34 80 Q 42 74 50 80', 'stroke': '#f59e0b', 'strokeWidth': 1.6}]
def duck_seg(f, i, w, L):
    s = [{'d': capsule(w, L), 'fill': '#fcd34d', 'stroke': '#b45309', 'strokeWidth': 2.5}]
    if i == 2:
        k = L * 0.5
        s.append({'d': f'M {-w} {-k} L {-w} {-L} A {w} {w} 0 0 1 {w} {-L} L {w} {-k} Z', 'fill': '#f97316', 'stroke': '#9a3412', 'strokeWidth': 2})
    else: s.append({'d': f'M {-w * 0.5} {-L * 0.5} Q 0 {-L * 0.35} {w * 0.5} {-L * 0.5}', 'stroke': '#f59e0b', 'strokeWidth': 1.4})
    return s

# ---- 4. toy brick: blocky, studs on top (generic building block, no brand marks)
def stud(cx, cy, r):
    return [{'d': circle(cx, cy, r), 'fill': '#ef4444', 'stroke': '#991b1b', 'strokeWidth': 1.4}, {'d': circle(cx - r * 0.25, cy - r * 0.25, r * 0.4), 'fill': '#fca5a5'}]
def brick_palm():
    s = [{'d': PALM_D, 'fill': '#ef4444', 'stroke': '#991b1b', 'strokeWidth': 2.8}, {'d': 'M 14 70 L 84 76', 'stroke': '#b91c1c', 'strokeWidth': 1.8}]
    studs = []
    for cx, cy in ((26, 54), (46, 56), (66, 58), (36, 90), (58, 90)):
        studs.append(stud(cx, cy, 5.5))
    return s + [x for g in studs for x in g]
def brick_seg(f, i, w, L):
    s = [{'d': block(w, L), 'fill': '#ef4444', 'stroke': '#991b1b', 'strokeWidth': 2.6}, {'d': f'M {-w} {-L * 0.5} L {w} {-L * 0.5}', 'stroke': '#b91c1c', 'strokeWidth': 1.5}]
    if i == 2: s += stud(0, -L - 0.5, w * 0.55)
    return s

# ---- 5. mechanical: plates, a gear at every joint, a piston rod beside each segment
def mech_palm():
    return [{'d': PALM_D, 'fill': '#78716c', 'stroke': '#292524', 'strokeWidth': 2.8},
            {'d': 'M 20 48 L 80 54 M 24 92 L 76 92', 'stroke': '#44403c', 'strokeWidth': 2},
            {'d': gear(50, 72, 13, 10), 'fill': '#a8a29e', 'stroke': '#292524', 'strokeWidth': 1.8},
            {'d': circle(50, 72, 6), 'fill': '#57534e', 'stroke': '#292524', 'strokeWidth': 1.6},
            {'d': circle(50, 72, 2.2), 'fill': '#d6d3d1'},
            {'d': circle(20, 98, 2.6) + circle(78, 98, 2.6) + circle(18, 50, 2.6), 'fill': '#d6d3d1', 'stroke': '#292524', 'strokeWidth': 1}]
def mech_seg(f, i, w, L):
    s = [{'d': block(w, L), 'fill': '#a8a29e' if i != 1 else '#8f8984', 'stroke': '#292524', 'strokeWidth': 2.4},
         {'d': f'M {w * 0.45} {-L * 0.2} L {w * 0.45} {-L * 0.85}', 'stroke': '#e7e5e4', 'strokeWidth': 2.2},
         {'d': f'M {-w * 0.45} {-L * 0.2} L {-w * 0.45} {-L * 0.85}', 'stroke': '#57534e', 'strokeWidth': 1.4}]
    if i < 2: s.append({'d': gear(0, -1, w * 0.85, 8, w * 0.28), 'fill': '#d6d3d1', 'stroke': '#292524', 'strokeWidth': 1.2})
    else: s.append({'d': circle(0, -L * 0.45, w * 0.35), 'fill': '#57534e', 'stroke': '#292524', 'strokeWidth': 1})
    return s

# ---- 6. cyberpunk: dark plated hand, magenta glow lines, cyan circuit traces and a LED at every tip
def cyber_palm():
    return [{'d': PALM_D, 'stroke': '#ec4899', 'strokeWidth': 9, 'opacity': 0.28},
            {'d': PALM_D, 'fill': '#111827', 'stroke': '#ec4899', 'strokeWidth': 2.2},
            {'d': 'M 22 56 L 40 56 L 46 66 L 66 66 M 30 92 L 44 92 L 50 82 L 72 82', 'stroke': '#22d3ee', 'strokeWidth': 1.6},
            {'d': poly([(60, 44), (80, 46), (82, 60), (66, 58)]), 'fill': '#1f2937', 'stroke': '#ec4899', 'strokeWidth': 1.2},
            {'d': circle(40, 56, 2.4) + circle(66, 66, 2.4), 'fill': '#22d3ee'}]
def cyber_seg(f, i, w, L):
    s = [{'d': capsule(w, L), 'stroke': '#ec4899', 'strokeWidth': 8, 'opacity': 0.28},
         {'d': capsule(w, L), 'fill': '#111827', 'stroke': '#f472b6', 'strokeWidth': 2},
         {'d': f'M {-w * 0.4} {-L * 0.15} L {-w * 0.4} {-L * 0.6} L 0 {-L * 0.8}', 'stroke': '#22d3ee', 'strokeWidth': 1.3}]
    if i == 2: s.append({'d': circle(0, -L * 0.55, w * 0.38), 'fill': '#22d3ee'})
    return s

# ---- 7. flaming: a charred, glowing hand; the flames themselves are the particle emitters (embers + glow), with static licks on the tips
def flame(w, base_y, h):
    return f'M {-w * 0.9} {base_y} Q {-w * 1.2} {base_y - h * 0.5} {-w * 0.2} {base_y - h * 0.62} Q {-w * 0.3} {base_y - h * 0.85} 0 {base_y - h} Q {w * 0.35} {base_y - h * 0.8} {w * 0.35} {base_y - h * 0.6} Q {w * 1.2} {base_y - h * 0.5} {w * 0.9} {base_y} Z'
def flame_palm():
    return [{'d': PALM_D, 'fill': '#3b1d12', 'stroke': '#7f1d1d', 'strokeWidth': 2.5},
            {'d': 'M 22 50 L 34 60 L 30 72 L 44 80 M 80 54 L 66 64 L 70 78 L 58 90', 'stroke': '#f97316', 'strokeWidth': 2.2},
            {'d': circle(50, 74, 10), 'stroke': '#ef4444', 'strokeWidth': 7, 'opacity': 0.3},
            {'d': circle(50, 74, 6), 'fill': '#f97316', 'stroke': '#7f1d1d', 'strokeWidth': 1.2}]
def flame_seg(f, i, w, L):
    s = [{'d': capsule(w, L), 'fill': '#7f1d1d' if i != 1 else '#6b1a1a', 'stroke': '#3b1d12', 'strokeWidth': 2.4},
         {'d': f'M {-w * 0.6} {-L * 0.35} L {w * 0.6} {-L * 0.45}', 'stroke': '#f97316', 'strokeWidth': 1.6}]
    if i == 2:
        s += [{'d': flame(w, -L, w * 3.4), 'fill': '#f97316', 'stroke': '#b91c1c', 'strokeWidth': 1.2},
              {'d': flame(w * 0.5, -L, w * 2.0), 'fill': '#fde047'}]
    return s

# ---- 8. floppy: GIANT HOTDOG FINGERS. Each segment is a very fat sausage; the tip overshoots the landmark and droops a little, so the fingers look long and floppy.
def floppy_palm():
    return [{'d': PALM_D, 'fill': '#f5d0a0', 'stroke': '#a16207', 'strokeWidth': 2.5}, {'d': 'M 30 62 C 40 68 54 68 66 60', 'stroke': '#fde68a', 'strokeWidth': 2.4}]
def floppy_seg(f, i, w, L):
    """A fat sausage link. The hand's `extend` field repeats the mid / tip links beyond the real fingertip (long and drooping), so the tip itself no longer fakes it."""
    W = w * (2.1 - 0.1 * i)
    d = capsule(W, L)
    out = [{'d': d, 'fill': '#d9573b', 'stroke': '#7f1d1d', 'strokeWidth': 2.6},
           {'d': f'M {-W * 0.5} {-L * 0.8} L {-W * 0.5} {-L * 0.2}', 'stroke': '#f8a58f', 'strokeWidth': 3, 'opacity': 0.8}]
    if i != 1: out.append({'d': f'M {-W * 0.8} {-L * 0.5} L {W * 0.8} {-L * 0.4} M {-W * 0.8} {-L * 0.8} L {W * 0.8} {-L * 0.7}', 'stroke': '#7f1d1d', 'strokeWidth': 1.6, 'opacity': 0.55})
    return out

POLY_T = tint('#38bdf8', {'#38bdf8': 'main', '#7dd3fc': 'light', '#0ea5e9': 'mid', '#0369a1': 'dark'})
FROG_T = tint('#6dbf4b', {'#6dbf4b': 'main', '#a7e07f': 'light', '#4f9a3b': 'mid', '#2f6b36': 'dark'})
BRICK_T = tint('#ef4444', {'#ef4444': 'main', '#fca5a5': 'light', '#b91c1c': 'mid', '#991b1b': 'dark'})
CYBER_T = tint('#ec4899', {'#ec4899': 'main', '#f472b6': 'light'})
FLOPPY_T = tint('#d9573b', {'#d9573b': 'main', '#f8a58f': 'light', '#7f1d1d': 'dark', '#f5d0a0': 'mid'}, ['#d9573b', '#fcd34d', '#a7e07f', '#7dd3fc', '#c4b5fd', '#d6a77a', '#8d5a3a', '#f8fafc'])

def skins():
    A = 'Finger Fight'
    return [build('frog', 'Frog', A, frog_palm(), frog_seg, category='animal', tint=FROG_T,
                web={'fill': '#4f9a3b', 'stroke': '#2f6b36', 'strokeWidth': 1.6, 'opacity': 0.95, 'reach': 0.72, 'scallop': 0.28}),
            build('duck', 'Duck', A, duck_palm(), duck_seg, category='animal',
                web={'fill': '#f97316', 'stroke': '#9a3412', 'strokeWidth': 1.6, 'opacity': 0.95, 'reach': 0.72, 'scallop': 0.28}),
            build('toybrick', 'Toy brick', A, brick_palm(), brick_seg, category='fantasy', tint=BRICK_T),
            build('mechanical', 'Mechanical', A, mech_palm(), mech_seg, category='scifi', free=False, unlock={'method': 'ad'},
                  particles=[{'effect': 'sparks', 'color': '#fde68a', 'where': 'knuckles', 'rate': 3}]),
            build('cyberpunk', 'Cyberpunk', A, cyber_palm(), cyber_seg, category='scifi', free=False, unlock={'method': 'ad'}, tint=CYBER_T,
                  particles=[{'effect': 'glint', 'color': '#22d3ee', 'where': 'hand', 'rate': 3}]),
            build('flaming', 'Flaming', A, flame_palm(), flame_seg, category='fantasy', free=False, unlock={'method': 'ad'},
                  particles=[{'effect': 'embers', 'color': '#f97316', 'where': 'tips', 'rate': 16}, {'effect': 'embers', 'color': '#fde047', 'where': 'hand', 'rate': 8},
                             {'effect': 'glow', 'color': '#dc2626', 'where': 'palm', 'rate': 3}, {'effect': 'glow', 'color': '#fb923c', 'where': 'tips', 'rate': 2}]),
            build('floppy', 'Hotdog fingers', A, floppy_palm(), floppy_seg, category='human', tint=FLOPPY_T,
                  extend={'len': 0.95, 'pieces': 3, 'droop': 1.35})]

# ---- nail items: shapes in the fingertip's space, reaching past the tip
def nail_item(id_, name, shape, category, tint_, free=True, unlock=None):
    parts = {f'{f}_tip': shape(f, HALF[f][2], LEN[f][2]) for f in FINGERS}
    out = {'format': 1, 'id': id_, 'name': name, 'author': 'Finger Fight', 'license': 'CC0 (made for Finger Fight)', 'layer': 'nails', 'category': category, 'tint': tint_, 'parts': parts}
    if not free: out['free'] = False; out['unlock'] = unlock
    return out
def long_nail(f, w, L):
    b = -(L - 5); sh = -(L + 1); tip = -(L + 19)
    return [{'d': f'M {-w * 0.8} {b} L {-w * 0.92} {sh} L 0 {tip} L {w * 0.92} {sh} L {w * 0.8} {b} Q 0 {b + 4} {-w * 0.8} {b} Z', 'fill': '#dc2626', 'stroke': '#7f1d1d', 'strokeWidth': 1.1},
            {'d': f'M {-w * 0.35} {sh + 2} L 0 {tip + 3}', 'stroke': '#fca5a5', 'strokeWidth': 1}]
def claw(f, w, L):
    b = -(L - 2)
    return [{'d': f'M {-w * 0.75} {b} Q {-w * 0.75} {b - 9} {w * 1.7} {b - 15} Q {w * 0.6} {b - 5} {w * 0.75} {b} Q 0 {b + 3} {-w * 0.75} {b} Z', 'fill': '#f1e6d0', 'stroke': '#6b4423', 'strokeWidth': 1.2},
            {'d': f'M {-w * 0.3} {b - 2} Q {w * 0.1} {b - 8} {w * 1.1} {b - 12}', 'stroke': '#fffbeb', 'strokeWidth': 0.9}]
def blade(f, w, L):
    b = -(L - 1)
    return [{'d': f'M {-w * 1.05} {-(L - 7)} L {w * 1.05} {-(L - 7)} L {w * 1.05} {b} L {-w * 1.05} {b} Z', 'fill': '#475569', 'stroke': '#0f172a', 'strokeWidth': 1},
            {'d': f'M {-w * 0.6} {b} L {-w * 0.5} {-(L + 20)} L 0 {-(L + 28)} L {w * 0.5} {-(L + 20)} L {w * 0.6} {b} Z', 'fill': '#cbd5e1', 'stroke': '#334155', 'strokeWidth': 1.1},
            {'d': f'M 0 {b} L 0 {-(L + 24)}', 'stroke': '#f8fafc', 'strokeWidth': 1}]

NAIL_SW = ['#dc2626', '#f97316', '#facc15', '#22c55e', '#22d3ee', '#3b82f6', '#a855f7', '#ec4899', '#f8fafc', '#111827']
def items():
    return [nail_item('longnails', 'Long nails', long_nail, 'human', tint('#dc2626', {'#dc2626': 'main', '#7f1d1d': 'dark', '#fca5a5': 'light'}, NAIL_SW)),
            nail_item('claws', 'Claws', claw, 'animal', tint('#f1e6d0', {'#f1e6d0': 'main', '#6b4423': 'dark', '#fffbeb': 'light'}, ['#f1e6d0'] + NAIL_SW[:-1])),
            nail_item('blades', 'Blade fingers', blade, 'scifi', tint('#cbd5e1', {'#cbd5e1': 'main', '#334155': 'dark', '#475569': 'mid', '#f8fafc': 'light'}, ['#cbd5e1', '#fbbf24', '#ef4444', '#22d3ee', '#a855f7', '#22c55e']),
                      free=False, unlock={'method': 'ad'})]

def write(path, data):
    with open(path, 'w') as fh:
        json.dump(data, fh, indent=1); fh.write('\n')

def add_to_manifest(path, key, ids):
    with open(path) as fh: m = json.load(fh)
    for i in ids:
        if i not in m[key]: m[key].append(i)
    with open(path, 'w') as fh: json.dump(m, fh); fh.write('\n')

def main():
    sk, it = skins(), items()
    for s in sk: write(os.path.join(ROOT, 'skins', s['id'] + '.json'), s)
    for i in it: write(os.path.join(ROOT, 'items', i['id'] + '.json'), i)
    add_to_manifest(os.path.join(ROOT, 'skins', 'manifest.json'), 'skins', [s['id'] for s in sk])
    add_to_manifest(os.path.join(ROOT, 'items', 'manifest.json'), 'items', [i['id'] for i in it])
    print('wrote', [s['id'] for s in sk], [i['id'] for i in it])

if __name__ == '__main__':
    main()
