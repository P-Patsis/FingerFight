#!/usr/bin/env python3
"""Part E: twelve more GENERIC items (no characters, brands or likenesses), same formats as before.
Hands: bone chrome burnbone sand eyes inksketch. Fingers (nails layer): scissors hook. Gloves: boxing rubber formal. Ring: ornate.
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

def chrome_palm():
    return [{'d': PALM_D, 'fill': '#9aa5b1', 'stroke': '#1f2937', 'strokeWidth': 2.5},
            {'d': 'M 24 44 L 76 50 M 22 70 L 78 74 M 40 36 L 38 100 M 62 40 L 62 98', 'stroke': '#e5e7eb', 'strokeWidth': 2},
            {'d': circle(50, 70, 9), 'fill': '#1f2937', 'stroke': '#ef4444', 'strokeWidth': 2}, {'d': circle(50, 70, 3.2), 'fill': '#ef4444'}]
def chrome_seg(f, i, w, L):
    k = w * 0.55
    return [{'d': f'M {-k} 0 L {-k} {-L} M {k} 0 L {k} {-L}', 'stroke': '#1f2937', 'strokeWidth': 3},
            {'d': f'M {-k} {-L * 0.08} L {k} {-L * 0.08} L {k} {-L * 0.92} L {-k} {-L * 0.92} Z', 'fill': '#cbd5e1', 'stroke': '#475569', 'strokeWidth': 1.4},
            {'d': f'M {-k * 0.3} {-L * 0.15} L {-k * 0.3} {-L * 0.85}', 'stroke': '#f8fafc', 'strokeWidth': 1.6},
            {'d': circle(0, -L, w * 0.75), 'fill': '#64748b', 'stroke': '#1f2937', 'strokeWidth': 1.6}]
CHROME_T = tint('#cbd5e1', {'#cbd5e1': 'main', '#9aa5b1': 'mid', '#475569': 'dark', '#f8fafc': 'light'}, ['#cbd5e1', '#fbbf24', '#b45309', '#22d3ee', '#a855f7', '#f8fafc'])

def burn_palm():
    p = bone_palm()
    return p + [{'d': 'M 24 100 Q 30 70 38 96 Q 44 62 52 96 Q 60 66 66 98 Q 72 78 76 100 Z', 'fill': '#f97316', 'opacity': 0.8}]
def burn_seg(f, i, w, L):
    s = bone_seg(f, i, w, L)
    if i == 2: s.append({'d': f'M {-w * 0.8} {-L - 1} Q {-w} {-L - 10} {-w * 0.3} {-L - 12} Q {-w * 0.2} {-L - 22} 0 {-L - 26} Q {w * 0.3} {-L - 18} {w * 0.5} {-L - 14} Q {w} {-L - 10} {w * 0.8} {-L - 1} Z', 'fill': '#fb923c', 'stroke': '#dc2626', 'strokeWidth': 1.2, 'opacity': 0.92})
    return s

def sand_palm():
    dots = ''.join(circle(x, y, r) for x, y, r in [(30, 60, 1.4), (44, 52, 1.2), (58, 66, 1.5), (40, 82, 1.3), (66, 84, 1.2), (52, 96, 1.4), (24, 80, 1.1)])
    return [{'d': PALM_D, 'fill': '#e9c98c', 'stroke': '#a8803f', 'strokeWidth': 2.2},
            {'d': 'M 14 70 Q 34 60 52 72 T 84 66 M 20 90 Q 40 80 58 90 T 80 84', 'stroke': '#cfa65c', 'strokeWidth': 2.2},
            {'d': dots, 'fill': '#f6e3b4'}]
def sand_seg(f, i, w, L):
    dots = ''.join(circle(((j * 7 + i * 3) % 9 - 4) * w * 0.15, -L * (0.2 + 0.2 * j), 0.9) for j in range(4))
    return [{'d': capsule(w, L), 'fill': '#e9c98c', 'stroke': '#a8803f', 'strokeWidth': 2.2},
            {'d': f'M {-w * 0.7} {-L * 0.35} Q 0 {-L * 0.45} {w * 0.7} {-L * 0.3}', 'stroke': '#cfa65c', 'strokeWidth': 1.6}, {'d': dots, 'fill': '#f6e3b4'}]
SAND_T = tint('#e9c98c', {'#e9c98c': 'main', '#a8803f': 'dark', '#cfa65c': 'mid', '#f6e3b4': 'light'})

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
            build('chrome', 'Chrome skeleton', A, chrome_palm(), chrome_seg, category='scifi', free=False, unlock={'method': 'ad'}, tint=CHROME_T,
                  particles=[{'effect': 'glint', 'color': '#f8fafc', 'where': 'knuckles', 'rate': 3}]),
            build('burnbone', 'Burning bone', A, burn_palm(), burn_seg, category='fantasy', free=False, unlock={'method': 'purchase', 'price': '0.99'},
                  particles=[{'effect': 'embers', 'color': '#f97316', 'where': 'tips', 'rate': 14}, {'effect': 'glow', 'color': '#dc2626', 'where': 'tips', 'rate': 2},
                             {'effect': 'embers', 'color': '#fde047', 'where': 'hand', 'rate': 6}]),
            build('sand', 'Sand', A, sand_palm(), sand_seg, category='fantasy', tint=SAND_T),
            build('eyes', 'Eyes in palm', A, eyes_palm(), eyes_seg, category='fantasy', free=False, unlock={'method': 'ad'}, tint=EYES_T),
            build('inksketch', 'Ink sketch', A, ink_palm(), ink_seg, category='human', tint=INK_T)]

# ---------------- fingers (nails layer): shapes in the fingertip space, reaching past the tip
def nails(id_, name, parts, category, tint_, free=True, unlock=None):
    out = {'format': 1, 'id': id_, 'name': name, 'author': A, 'license': 'CC0 (made for Finger Fight)', 'layer': 'nails', 'category': category, 'tint': tint_, 'parts': parts}
    if not free: out['free'] = False; out['unlock'] = unlock
    return out
def scissors_tip(w, L):
    b = -(L - 2)
    blade = lambda s: {'d': f'M {s * w * 0.1} {b} L {s * w * 1.0} {-(L + 26)} L {s * w * 0.35} {-(L + 26)} L {-s * w * 0.4} {b} Z', 'fill': '#cbd5e1', 'stroke': '#334155', 'strokeWidth': 1.1}
    return [blade(-1), blade(1), {'d': circle(0, b - 1, 2.2), 'fill': '#f59e0b', 'stroke': '#334155', 'strokeWidth': 1}]
def hook_tip(w, L):
    b = -(L - 3)
    return [{'d': f'M {-w * 0.9} {b} L {w * 0.9} {b} L {w * 0.9} {b - 8} L {-w * 0.9} {b - 8} Z', 'fill': '#6b7280', 'stroke': '#111827', 'strokeWidth': 1.2},
            {'d': f'M {-w * 0.35} {b - 8} L {-w * 0.35} {-(L + 18)} C {-w * 0.35} {-(L + 36)} {w * 2.6} {-(L + 36)} {w * 2.4} {-(L + 16)} L {w * 1.9} {-(L + 20)} C {w * 2} {-(L + 28)} {w * 0.35} {-(L + 28)} {w * 0.35} {-(L + 18)} L {w * 0.35} {b - 8} Z', 'fill': '#d1d5db', 'stroke': '#374151', 'strokeWidth': 1.3},
            {'d': f'M 0 {b - 8} L 0 {-(L + 20)}', 'stroke': '#f9fafb', 'strokeWidth': 0.9}]
SCISS_T = tint('#cbd5e1', {'#cbd5e1': 'main', '#334155': 'dark', '#f59e0b': 'mid'}, ['#cbd5e1', '#fbbf24', '#ef4444', '#22d3ee', '#a855f7'])
HOOK_T = tint('#d1d5db', {'#d1d5db': 'main', '#374151': 'dark', '#6b7280': 'mid', '#f9fafb': 'light'}, ['#d1d5db', '#fbbf24', '#b45309', '#22d3ee'])

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
            'free': False, 'unlock': {'method': 'purchase', 'price': '0.99'},
            'particles': [{'effect': 'glow', 'color': '#c084fc', 'where': 'tips', 'rate': 2}, {'effect': 'glint', 'color': '#f5f3ff', 'where': 'knuckles', 'rate': 3}],
            'parts': {'ring_base': [
                {'d': f'M {-w * 1.05} {y + 3} L {w * 1.05} {y + 3} L {w * 1.05} {y - 3} L {-w * 1.05} {y - 3} Z', 'fill': '#fbbf24', 'stroke': '#92400e', 'strokeWidth': 1.2},
                {'d': poly([(0, y - 14), (w * 0.9, y - 6), (0, y + 2), (-w * 0.9, y - 6)]), 'fill': '#a855f7', 'stroke': '#6b21a8', 'strokeWidth': 1.2},
                {'d': f'M {-w * 0.4} {y - 8} L 0 {y - 12} L {w * 0.3} {y - 8}', 'stroke': '#e9d5ff', 'strokeWidth': 1},
                {'d': circle(-w * 1.2, y - 2, 1.6) + circle(w * 1.2, y - 2, 1.6), 'fill': '#fde68a'}]}}

def items():
    sc = nails('scissors', 'Scissor fingers', {'index_tip': scissors_tip(HALF['index'][2], LEN['index'][2]), 'middle_tip': scissors_tip(HALF['middle'][2], LEN['middle'][2])}, 'scifi', SCISS_T, free=False, unlock={'method': 'ad'})
    hk = nails('hook', 'Pirate hook', {'index_tip': hook_tip(HALF['index'][2], LEN['index'][2])}, 'fantasy', HOOK_T)
    return [sc, hk, glove('boxing', 'Boxing gloves', box_palm(), box_seg, BOX_T), glove('rubber', 'Rubber gloves', rub_palm(), rub_seg, RUB_T),
            glove('formal', 'Formal gloves', formal_palm(), formal_seg, FORMAL_T, free=False, unlock={'method': 'ad'}), ornate()]

def main():
    sk, it = skins(), items()
    for s in sk: write(os.path.join(ROOT, 'skins', s['id'] + '.json'), s)
    for i in it: write(os.path.join(ROOT, 'items', i['id'] + '.json'), i)
    add_to_manifest(os.path.join(ROOT, 'skins', 'manifest.json'), 'skins', [s['id'] for s in sk])
    add_to_manifest(os.path.join(ROOT, 'items', 'manifest.json'), 'items', [i['id'] for i in it])
    print('wrote', [s['id'] for s in sk], [i['id'] for i in it])
if __name__ == '__main__': main()
