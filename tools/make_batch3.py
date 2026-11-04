#!/usr/bin/env python3
"""Part E: twelve more GENERIC items (no characters, brands or likenesses), same formats as before.
Hands: bone burnbone sand eyes inksketch. Fingers: scissors (long blades, nails layer); the hook is a HAND now (make_batch5.py). Gloves: boxing rubber formal. Ring: ornate.
Run: python3 tools/make_batch3.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from make_skins import LEN, HALF, PALM_D, capsule, block, circle, build
from make_batch1 import poly, tint, write, add_to_manifest, ROOT, f2, FINGERS, NAIL_SW

A = 'Finger Fight'
SEG = [(f, i) for f in FINGERS for i in range(3)]
NAMES = {(f, i): f'{f}_{("base", "mid", "tip")[i]}' for f, i in SEG}

# ---------------- hands
def bone_palm():
    return [{'d': PALM_D, 'fill': '#f1ead8', 'stroke': '#8a7a58', 'strokeWidth': 2.5},
            {'d': circle(34, 48, 6) + circle(50, 46, 6) + circle(66, 50, 6), 'fill': '#e6dcc0', 'stroke': '#8a7a58', 'strokeWidth': 1.5},
            {'d': 'M 34 54 L 34 90 M 50 52 L 50 92 M 66 56 L 66 88', 'stroke': '#c9bb96', 'strokeWidth': 5}]
def bone_seg(f, i, w, L):
    k = w * 0.7
    s = [{'d': f'M {-k} {-L * 0.12} L {-k} {-L * 0.88} M {k} {-L * 0.12} L {k} {-L * 0.88}', 'stroke': '#8a7a58', 'strokeWidth': 2.5},
         {'d': f'M {-k} {-L * 0.1} L {k} {-L * 0.1} L {k} {-L * 0.9} L {-k} {-L * 0.9} Z', 'fill': '#f1ead8'},
         {'d': circle(-k * 0.9, -L, w * 0.7) + circle(k * 0.9, -L, w * 0.7), 'fill': '#f1ead8', 'stroke': '#8a7a58', 'strokeWidth': 1.6}]
    if i == 2: s.append({'d': circle(0, -L - 1, w * 0.9), 'fill': '#f1ead8', 'stroke': '#8a7a58', 'strokeWidth': 1.6})
    return s
BONE_T = tint('#f1ead8', {'#f1ead8': 'main', '#8a7a58': 'dark', '#e6dcc0': 'mid', '#c9bb96': 'light'})

def flame_shapes(part):
    # Share Flaming's authored static flames; make_batch1 must run first.
    with open(os.path.join(ROOT, 'skins', 'flaming.json')) as fh:
        flaming = json.load(fh)
    return [s for s in flaming['parts'][part]['shapes']
            if s.get('fill') in ('#f97316', '#fde047') and s['d'].count('Q') == 4]

def burn_palm():
    return bone_palm() + flame_shapes('palm')
def burn_seg(f, i, w, L):
    return bone_seg(f, i, w, L) + flame_shapes(NAMES[(f, i)])

# Sand: a grainy body (dots of three sands, drawn as zero-length round-capped strokes so one shape holds dozens), a rough edge of loose grains,
# and, from the skin's "sand" field + a `grain` emitter, a hand that sheds sand and crumbles when shaken (js/sand.js).
import random
SAND_BODY, SAND_EDGE, SAND_DARK, SAND_MID, SAND_LIGHT = '#e2bf7e', '#b98f4a', '#a8803f', '#cfa65c', '#f7e6b8'
def dots(pts):
    return ' '.join(f'M {f2(x)} {f2(y)} h 0.1' for x, y in pts)
def scatter(rng, n, x0, x1, y0, y1):
    return [(rng.uniform(x0, x1), rng.uniform(y0, y1)) for _ in range(n)]
def sand_palm():
    rng = random.Random(11)
    return [{'d': PALM_D, 'fill': SAND_BODY, 'stroke': SAND_EDGE, 'strokeWidth': 1.6},
            {'d': 'M 14 70 Q 34 60 52 72 T 84 66 M 20 90 Q 40 80 58 90 T 80 84', 'stroke': SAND_MID, 'strokeWidth': 2},
            {'d': dots(scatter(rng, 70, 14, 84, 38, 102)), 'stroke': SAND_DARK, 'strokeWidth': 1.5},
            {'d': dots(scatter(rng, 70, 14, 84, 38, 102)), 'stroke': SAND_LIGHT, 'strokeWidth': 1.4},
            {'d': dots([(9, 52), (8, 66), (12, 80), (20, 94), (88, 52), (87, 66), (82, 82), (74, 98), (26, 31), (50, 34), (72, 37)]), 'stroke': SAND_EDGE, 'strokeWidth': 2.2}]
def sand_seg(f, i, w, L):
    rng = random.Random(100 + i * 7 + len(f))
    edge = [(s * (w + rng.uniform(-0.4, 0.9)), -rng.uniform(0.1, 0.95) * L) for s in (-1, 1) for _ in range(3)]
    return [{'d': capsule(w, L), 'fill': SAND_BODY, 'stroke': SAND_EDGE, 'strokeWidth': 1.5},
            {'d': f'M {-w * 0.7} {-L * 0.35} Q 0 {-L * 0.45} {w * 0.7} {-L * 0.3}', 'stroke': SAND_MID, 'strokeWidth': 1.3},
            {'d': dots(scatter(rng, 16, -w * 0.8, w * 0.8, -L * 0.95, -L * 0.05)), 'stroke': SAND_DARK, 'strokeWidth': 1.2},
            {'d': dots(scatter(rng, 16, -w * 0.8, w * 0.8, -L * 0.95, -L * 0.05)), 'stroke': SAND_LIGHT, 'strokeWidth': 1.1},
            {'d': dots(edge), 'stroke': SAND_EDGE, 'strokeWidth': 1.8}]
SAND_T = tint(SAND_BODY, {SAND_BODY: 'main', SAND_EDGE: 'dark', SAND_DARK: 'dark', SAND_MID: 'mid', SAND_LIGHT: 'light'})

def eye(cx, cy, r):
    return [{'d': f'M {cx - r} {cy} Q {cx} {cy - r * 0.9} {cx + r} {cy} Q {cx} {cy + r * 0.9} {cx - r} {cy} Z', 'fill': '#ffffff', 'stroke': '#1f2937', 'strokeWidth': 1.4},
            {'d': circle(cx, cy, r * 0.42), 'fill': '#2563eb', 'stroke': '#1f2937', 'strokeWidth': 0.8}, {'d': circle(cx, cy, r * 0.18), 'fill': '#0f172a'}]
def eyes_palm():
    return ([{'d': PALM_D, 'fill': '#d9b48f', 'stroke': '#7a5233', 'strokeWidth': 2.5}] + eye(50, 70, 17) + eye(28, 54, 7) + eye(72, 58, 7))[:12]
def eyes_seg(f, i, w, L):
    s = [{'d': capsule(w, L), 'fill': '#d9b48f', 'stroke': '#7a5233', 'strokeWidth': 2.5}]
    if i == 0: s += eye(0, -L * 0.5, w * 0.8)
    return s
EYES_T = tint('#d9b48f', {'#d9b48f': 'main', '#7a5233': 'dark'})

def ink_palm():
    return [{'d': PALM_D, 'fill': '#faf7ee', 'stroke': '#111827', 'strokeWidth': 2.4},
            {'d': 'M 20 50 L 34 44 M 22 56 L 40 48 M 24 62 L 46 52 M 20 80 L 44 66 M 24 90 L 52 74 M 40 98 L 62 82 M 58 100 L 76 88', 'stroke': '#111827', 'strokeWidth': 1},
            {'d': 'M 28 62 C 40 66 54 66 66 60', 'stroke': '#111827', 'strokeWidth': 1.6}]
def ink_seg(f, i, w, L):
    hatch = ' '.join(f'M {-w * 0.9} {-L * (0.15 + 0.2 * j)} L {-w * 0.1} {-L * (0.05 + 0.2 * j)}' for j in range(4))
    return [{'d': capsule(w, L), 'fill': '#faf7ee', 'stroke': '#111827', 'strokeWidth': 2}, {'d': hatch, 'stroke': '#111827', 'strokeWidth': 0.9},
            {'d': f'M {w * 1.12} 0 L {w * 1.12} {-L}', 'stroke': '#111827', 'strokeWidth': 1.2, 'opacity': 0.7}]
INK_T = tint('#faf7ee', {'#faf7ee': 'main', '#111827': 'dark'}, ['#faf7ee', '#fde68a', '#bae6fd', '#fbcfe8', '#bbf7d0', '#fed7aa'])

def skins():
    return [build('bone', 'Bone', A, bone_palm(), bone_seg, category='scifi', tint=BONE_T),
            build('burnbone', 'Burning bone', A, burn_palm(), burn_seg, category='fantasy', free=False, unlock={'method': 'ad'},
                  particles=[{'effect': 'flame', 'color': '#dc2626', 'where': 'hand', 'rate': 32},
                             {'effect': 'flame', 'color': '#f97316', 'where': 'hand', 'rate': 32},
                             {'effect': 'flame', 'color': '#fde047', 'where': 'tips', 'rate': 26},
                             {'effect': 'flame', 'color': '#fb923c', 'where': 'palm', 'rate': 22}]),
            build('sand', 'Sand', A, sand_palm(), sand_seg, category='fantasy', tint=SAND_T,
                  sand={'color': SAND_BODY, 'color2': SAND_LIGHT},
                  particles=[{'effect': 'grain', 'color': SAND_BODY, 'where': 'hand', 'rate': 7}]),
            build('eyes', 'Eyes in palm', A, eyes_palm(), eyes_seg, category='fantasy', free=False, unlock={'method': 'ad'}, tint=EYES_T),
            build('inksketch', 'Ink sketch', A, ink_palm(), ink_seg, category='human', tint=INK_T)]

# ---------------- fingers (nails layer): shapes in the fingertip space, reaching past the tip
def nails(id_, name, parts, category, tint_, free=True, unlock=None, dynamic=None, side=None):
    out = {'format': 1, 'id': id_, 'name': name, 'author': A, 'license': 'CC0 (made for Finger Fight)', 'layer': 'nails', 'category': category, 'tint': tint_, 'parts': parts}
    if not free: out['free'] = False; out['unlock'] = unlock
    if dynamic: out['dynamic'] = dynamic
    if side: out['side'] = side
    return out
# Scissor fingers: each of the four fingers is replaced by a LONG steel blade (a plate over the middle segment, a long tapering blade from the tip);
# index and middle blades lean toward each other like open scissors. Dynamic: the blade retracts / hides when its finger curls; length-aware via the rig.
LEAN = {'index': 1, 'middle': -1}
def scissors_mid(f, w, L):
    W = w * 1.1
    return [{'d': f'M {-W} 0 L {-W} {-L} L {W} {-L} L {W} 0 Z', 'fill': '#94a3b8', 'stroke': '#475569', 'strokeWidth': 1.4},
            {'d': circle(0, -L * 0.5, 1.9), 'fill': '#f59e0b', 'stroke': '#334155', 'strokeWidth': 1}]
def scissors_tip(f, w, L):
    b = -(L - 4); W = w * 1.1; tx = LEAN.get(f, 0) * w * 1.1
    return [{'d': poly([(-W, b), (-W, -(L + 8)), (tx - w * 0.18, -(L + 66)), (tx + w * 0.18, -(L + 70)), (W, -(L + 8)), (W, b)]), 'fill': '#cbd5e1', 'stroke': '#334155', 'strokeWidth': 1.2},
            {'d': f'M {-W * 0.25} {b} L {tx * 0.9} {-(L + 62)}', 'stroke': '#f8fafc', 'strokeWidth': 1},
            {'d': f'M {-W} {b} L {W} {b}', 'stroke': '#334155', 'strokeWidth': 1.6}]
SCISS_T = tint('#cbd5e1', {'#cbd5e1': 'main', '#334155': 'dark', '#f59e0b': 'mid'}, ['#cbd5e1', '#fbbf24', '#ef4444', '#22d3ee', '#a855f7'])

# ---------------- gloves: every part
def glove(id_, name, palm, seg, tint_, free=True, unlock=None):
    parts = {'palm': palm}
    for f, i in SEG: parts[NAMES[(f, i)]] = seg(f, i, HALF[f][i] , LEN[f][i])
    out = {'format': 1, 'id': id_, 'name': name, 'author': A, 'license': 'CC0 (made for Finger Fight)', 'layer': 'glove', 'category': 'human', 'tint': tint_, 'parts': parts}
    if not free: out['free'] = False; out['unlock'] = unlock
    return out
def box_palm():
    return [{'d': PALM_D, 'fill': '#dc2626', 'stroke': '#7f1d1d', 'strokeWidth': 3}, {'d': 'M 28 100 L 72 100', 'stroke': '#f8fafc', 'strokeWidth': 6},
            {'d': 'M 30 56 C 40 48 60 50 70 58', 'stroke': '#fca5a5', 'strokeWidth': 2.6}]
def box_seg(f, i, w, L):
    W = w * (1.5 if f != 'thumb' else 1.45)
    return [{'d': capsule(W, L * 1.02), 'fill': '#dc2626', 'stroke': '#7f1d1d', 'strokeWidth': 2.4}, {'d': f'M {-W * 0.5} {-L * 0.8} L {-W * 0.5} {-L * 0.2}', 'stroke': '#fca5a5', 'strokeWidth': 2.2}]
BOX_T = tint('#dc2626', {'#dc2626': 'main', '#7f1d1d': 'dark', '#fca5a5': 'light', '#f8fafc': 'mid'}, ['#dc2626', '#2563eb', '#facc15', '#16a34a', '#111827', '#f8fafc'])
def rub_palm():
    return [{'d': PALM_D, 'fill': '#facc15', 'stroke': '#a16207', 'strokeWidth': 3}, {'d': 'M 28 100 L 72 100', 'stroke': '#ca8a04', 'strokeWidth': 6},
            {'d': 'M 30 58 L 70 62', 'stroke': '#fef08a', 'strokeWidth': 2.2}]
def rub_seg(f, i, w, L):
    return [{'d': capsule(w * 1.12, L * 1.01), 'fill': '#facc15', 'stroke': '#a16207', 'strokeWidth': 2.2}, {'d': f'M {-w * 0.5} {-L * 0.8} L {-w * 0.5} {-L * 0.25}', 'stroke': '#fef08a', 'strokeWidth': 1.8}]
RUB_T = tint('#facc15', {'#facc15': 'main', '#a16207': 'dark', '#ca8a04': 'mid', '#fef08a': 'light'}, ['#facc15', '#ef4444', '#22c55e', '#3b82f6', '#ec4899', '#f8fafc'])
def formal_palm():
    return [{'d': PALM_D, 'fill': '#f5efe0', 'stroke': '#8a7a58', 'strokeWidth': 2.6}, {'d': 'M 26 98 L 74 98', 'stroke': '#8a7a58', 'strokeWidth': 6},
            {'d': 'M 28 102 Q 34 110 40 102 Q 46 110 52 102 Q 58 110 64 102 Q 68 108 72 102', 'stroke': '#fffaf0', 'strokeWidth': 2.4},
            {'d': circle(50, 90, 2.2) + circle(50, 82, 2.2), 'fill': '#3b2a1a'}, {'d': 'M 30 56 L 40 62 M 46 54 L 52 62 M 62 56 L 58 64', 'stroke': '#8a7a58', 'strokeWidth': 1.2}]
def formal_seg(f, i, w, L):
    return [{'d': capsule(w * 1.1, L * 1.01), 'fill': '#f5efe0', 'stroke': '#8a7a58', 'strokeWidth': 2}, {'d': f'M {-w * 0.6} {-L * 0.6} L {w * 0.6} {-L * 0.6}', 'stroke': '#8a7a58', 'strokeWidth': 1}]
FORMAL_T = tint('#f5efe0', {'#f5efe0': 'main', '#8a7a58': 'dark', '#fffaf0': 'light'}, ['#f5efe0', '#111827', '#7f1d1d', '#1e3a8a', '#d6b25e'])

# ---------------- ring: ornate, glowing gem; its own particles
def ornate():
    w = HALF['ring'][0]; L = LEN['ring'][0]; y = -L * 0.55
    return {'format': 1, 'id': 'ornate', 'name': 'Ornate ring', 'author': A, 'license': 'CC0 (made for Finger Fight)', 'layer': 'ring', 'category': 'fantasy',
            'tint': tint('#a855f7', {'#a855f7': 'main', '#e9d5ff': 'light', '#6b21a8': 'dark'}, ['#a855f7', '#22d3ee', '#ef4444', '#22c55e', '#facc15']),
            'free': False, 'unlock': {'method': 'ad'},
            'particles': [{'effect': 'glow', 'color': '#c084fc', 'where': 'tips', 'rate': 2}, {'effect': 'glint', 'color': '#f5f3ff', 'where': 'knuckles', 'rate': 3}],
            'parts': {'ring_base': [
                {'d': f'M {-w * 1.05} {y + 3} L {w * 1.05} {y + 3} L {w * 1.05} {y - 3} L {-w * 1.05} {y - 3} Z', 'fill': '#fbbf24', 'stroke': '#92400e', 'strokeWidth': 1.2},
                {'d': poly([(0, y - 14), (w * 0.9, y - 6), (0, y + 2), (-w * 0.9, y - 6)]), 'fill': '#a855f7', 'stroke': '#6b21a8', 'strokeWidth': 1.2},
                {'d': f'M {-w * 0.4} {y - 8} L 0 {y - 12} L {w * 0.3} {y - 8}', 'stroke': '#e9d5ff', 'strokeWidth': 1},
                {'d': circle(-w * 1.2, y - 2, 1.6) + circle(w * 1.2, y - 2, 1.6), 'fill': '#fde68a'}]}}

def items():
    parts = {}
    for f in ('index', 'middle', 'ring', 'pinky'):
        parts[f + '_mid'] = scissors_mid(f, HALF[f][1], LEN[f][1])
        parts[f + '_tip'] = scissors_tip(f, HALF[f][2], LEN[f][2])
    sc = nails('scissors', 'Scissor fingers', parts, 'scifi', SCISS_T, free=False, unlock={'method': 'ad'}, dynamic={'pivot': 0.7, 'min': 0.15, 'only': 'tip'}, side='both')
    return [sc, glove('boxing', 'Boxing gloves', box_palm(), box_seg, BOX_T), glove('rubber', 'Rubber gloves', rub_palm(), rub_seg, RUB_T),
            glove('formal', 'Formal gloves', formal_palm(), formal_seg, FORMAL_T, free=False, unlock={'method': 'ad'}), ornate()]

def main():
    sk, it = skins(), items()
    for s in sk: write(os.path.join(ROOT, 'skins', s['id'] + '.json'), s)
    for i in it: write(os.path.join(ROOT, 'items', i['id'] + '.json'), i)
    add_to_manifest(os.path.join(ROOT, 'skins', 'manifest.json'), 'skins', [s['id'] for s in sk])
    add_to_manifest(os.path.join(ROOT, 'items', 'manifest.json'), 'items', [i['id'] for i in it])
    print('wrote', [s['id'] for s in sk], [i['id'] for i in it])
if __name__ == '__main__': main()
