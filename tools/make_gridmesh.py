#!/usr/bin/env python3
"""Part D hand: GRIDMESH, a see-through wireframe hand made of triangles (lines only, a faint fill), unlike the solid Geometric polygons.
Also writes the static Painting skin (seed 1; the real one is generated per match by js/generated.js). Run: python3 tools/make_gridmesh.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from make_skins import LEN, HALF, PALM_REF, PALM_D, build
from make_batch1 import poly, tint, add_to_manifest, write, ROOT, f2

LINE, DARK, FILL = '#22d3ee', '#0e7490', '#67e8f9'
GRID_T = tint(LINE, {LINE: 'main', DARK: 'dark', FILL: 'light'})

def path(segs): return ' '.join(f'M {f2(a[0])} {f2(a[1])} L {f2(b[0])} {f2(b[1])}' for a, b in segs)

def grid_seg(f, i, w, L):
    R, C = 3, 2
    pt = [[(-w + 2 * w * c / C, -L * r / R) for c in range(C + 1)] for r in range(R + 1)]
    lines = []
    for r in range(R + 1): lines.append((pt[r][0], pt[r][C]))
    for r in range(R):
        for c in range(C):
            lines.append((pt[r][c], pt[r + 1][c]) if c else (pt[r][0], pt[r + 1][0]))
            lines.append((pt[r][c], pt[r + 1][c + 1]) if (r + c) % 2 == 0 else (pt[r][c + 1], pt[r + 1][c]))
    lines += [(pt[r][C], pt[r + 1][C]) for r in range(R)]
    top = [(-w, -L), (-w * 0.5, -L - w * 0.6), (w * 0.5, -L - w * 0.6), (w, -L)] if i == 2 else []
    return [{'d': poly([(-w, 0), (-w, -L)] + top[1:3] * (1 if top else 0) + [(w, -L), (w, 0)]), 'fill': FILL, 'opacity': 0.12},
            {'d': path(lines), 'stroke': LINE, 'strokeWidth': 1.1},
            {'d': poly([(-w, 0), (-w, -L)] + top[1:3] + [(w, -L), (w, 0)]).replace(' Z', ''), 'stroke': DARK, 'strokeWidth': 2}]

def grid_palm():
    pts = [(30, 106), (14, 90), (8, 56), (14, 36), (24, 31), (50, 34), (76, 38), (88, 50), (86, 78), (70, 106)]
    c = (48, 70)
    lines = [(p, c) for p in pts] + [(pts[k], pts[(k + 2) % len(pts)]) for k in range(0, len(pts), 2)]
    return [{'d': PALM_D, 'fill': FILL, 'opacity': 0.12}, {'d': path(lines), 'stroke': LINE, 'strokeWidth': 1.1},
            {'d': PALM_D, 'stroke': DARK, 'strokeWidth': 2.2}]

def main():
    grid = build('gridmesh', 'Gridmesh', 'Finger Fight', grid_palm(), grid_seg, category='scifi', tint=GRID_T)
    write(os.path.join(ROOT, 'skins', 'gridmesh.json'), grid)
    add_to_manifest(os.path.join(ROOT, 'skins', 'manifest.json'), 'skins', ['gridmesh'])
    print('wrote gridmesh')
if __name__ == '__main__': main()
