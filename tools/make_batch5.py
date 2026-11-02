#!/usr/bin/env python3
"""Part B: the Pirate HOOK as a whole-hand (Hand category) replacement. Every finger is a thin steel rod and carries a dynamic HOOK overlay on its tip:
the hook shows when that finger is raised and disappears when it curls, so the number of hooks equals the number of raised fingers. Length-aware
(overlays on tip parts ride the last link of an extension). Also retires the old hook (nails item), blades and chrome files.
Run after make_batch1 / make_batch3: python3 tools/make_batch5.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from make_skins import LEN, HALF, PALM_D, capsule, circle, build
from make_batch1 import tint, write, add_to_manifest, ROOT, FINGERS

A = 'Finger Fight'
def hook_palm():
    return [{'d': PALM_D, 'fill': '#7c4a21', 'stroke': '#3b2410', 'strokeWidth': 2.5},
            {'d': 'M 14 66 L 84 72 M 18 90 L 80 92', 'stroke': '#3b2410', 'strokeWidth': 3},
            {'d': 'M 26 66 L 26 74 M 50 69 L 50 77 M 72 72 L 72 80', 'stroke': '#d1d5db', 'strokeWidth': 2.4},
            {'d': circle(50, 50, 9), 'fill': '#9ca3af', 'stroke': '#374151', 'strokeWidth': 1.6}, {'d': circle(50, 50, 3), 'fill': '#374151'}]
def hook_seg(f, i, w, L):
    k = w * 0.62
    return [{'d': capsule(k, L), 'fill': '#9ca3af', 'stroke': '#374151', 'strokeWidth': 2},
            {'d': f'M {-k * 0.35} {-L * 0.15} L {-k * 0.35} {-L * 0.85}', 'stroke': '#f9fafb', 'strokeWidth': 1.2},
            {'d': circle(0, -1, 1.7), 'fill': '#374151'}]
def hook_shapes(w, L):
    """A J-shaped hook in the fingertip's space: collar, shaft, a curl back toward the finger and a point."""
    b = -(L - 3)
    d = f'M 0 {b - 4} L 0 {-(L + 22)} C 0 {-(L + 42)} {w * 3.6} {-(L + 42)} {w * 3.6} {-(L + 26)} L {w * 2.8} {-(L + 18)}'
    return [{'d': d, 'stroke': '#374151', 'strokeWidth': 5.6},
            {'d': d, 'stroke': '#d1d5db', 'strokeWidth': 3.2},
            {'d': f'M 0 {b - 4} L 0 {-(L + 18)}', 'stroke': '#f9fafb', 'strokeWidth': 1},
            {'d': f'M {-w * 0.95} {b} L {w * 0.95} {b} L {w * 0.95} {b - 7} L {-w * 0.95} {b - 7} Z', 'fill': '#6b7280', 'stroke': '#111827', 'strokeWidth': 1.2}]
HOOK_T = tint('#9ca3af', {'#9ca3af': 'main', '#d1d5db': 'light', '#374151': 'dark', '#6b7280': 'mid', '#f9fafb': 'light'}, ['#9ca3af', '#fbbf24', '#b45309', '#22d3ee', '#a855f7', '#22c55e'])

def hook_skin():
    overlays = [{'part': f'{f}_tip', 'shapes': hook_shapes(HALF[f][2], LEN[f][2]), 'dynamic': {'pivot': 0.6, 'min': 0.3, 'only': 'tip'}} for f in FINGERS]
    return build('hook', 'Pirate hook', A, hook_palm(), hook_seg, overlays=overlays, category='fantasy', tint=HOOK_T)

def retire():
    """Removes the files and manifest entries of the retired items."""
    for kind, key, ids in (('skins', 'skins', ['chrome']), ('items', 'items', ['blades', 'hook'])):
        mp = os.path.join(ROOT, kind, 'manifest.json')
        with open(mp) as fh: m = json.load(fh)
        m[key] = [x for x in m[key] if x not in ids]
        with open(mp, 'w') as fh: json.dump(m, fh); fh.write('\n')
        for i in ids:
            p = os.path.join(ROOT, kind, i + '.json')
            if os.path.exists(p): os.remove(p)

def main():
    retire()
    write(os.path.join(ROOT, 'skins', 'hook.json'), hook_skin())
    add_to_manifest(os.path.join(ROOT, 'skins', 'manifest.json'), 'skins', ['hook'])
    print('wrote hook; retired chrome, blades, hook item')

if __name__ == '__main__':
    main()
