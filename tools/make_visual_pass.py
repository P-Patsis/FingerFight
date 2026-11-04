#!/usr/bin/env python3
"""Material detail pass. Run LAST, after the original asset generators and make_anims.py.
Adds only normal rig paths/anim data; `detail` is an authoring marker ignored by the parser.
Idempotent: replaces its own detail paths without changing authored body geometry.
"""
import json
import math
from pathlib import Path
from make_skins import LEN, HALF

ROOT = Path(__file__).resolve().parents[1] / 'assets'
MARK = 'material-v1'
METAL = ['robot', 'mechanical', 'gauntlet', 'goldhand', 'cyberpunk', 'hook']
CLOTH = ['whiteglove', 'leather', 'fingerless', 'boxing', 'rubber', 'formal']
RINGS = ['goldring', 'silverring', 'ruby', 'ornate']
NAILS = ['nailpolish', 'longnails', 'claws', 'longclaws', 'scissors']

def path(d, color, width=1, opacity=1, fill=False, anim=None):
    out = {'d': d, 'fill' if fill else 'stroke': color, 'opacity': opacity, 'detail': MARK}
    if not fill: out['strokeWidth'] = width
    if anim: out['anim'] = anim
    return out

def motion(n, lateral=0.5, vertical=0.7):
    phase = round((n * 0.7) % 6.28, 2)
    return {'drift': [lateral, vertical, 0.12, phase], 'pulse': [0.22, 0.5, phase]}

def dims(name):
    if name == 'palm': return None
    f, seg = name.split('_'); i = ['base', 'mid', 'tip'].index(seg)
    return HALF[f][i], LEN[f][i]

def polish(folder, sid):
    file = ROOT / folder / (sid + '.json'); text = file.read_text(); obj = json.loads(text)
    for n, (name, raw) in enumerate(obj['parts'].items()):
        shapes = raw['shapes'] if isinstance(raw, dict) else raw
        shapes[:] = [s for s in shapes if s.get('detail') != MARK]
        size = dims(name)
        if sid == 'sand':
            if name == 'palm':
                shapes += [path('M 70 44 Q 84 62 71 91 L 64 99 Q 73 68 64 45 Z', '#a8803f', opacity=0.18, fill=True),
                           path('M 21 55 Q 16 76 33 92 M 27 46 L 36 42 M 43 44 L 49 42', '#f7e6b8', 2.1, 0.44),
                           path('M 27 70 Q 42 63 57 71 M 40 82 Q 53 76 69 81', '#a8803f', 0.8, 0.32)]
            else:
                w, L = size
                shapes += [path(f'M {w*.3:.2f} -1 Q {w*.83:.2f} {-L*.45:.2f} {w*.3:.2f} {-L:.2f} L {w*.8:.2f} {-L*.8:.2f} L {w*.8:.2f} -2 Z', '#a8803f', opacity=0.2, fill=True),
                           path(f'M {-w*.56:.2f} {-L*.2:.2f} Q {-w*.8:.2f} {-L*.5:.2f} {-w*.4:.2f} {-L*.8:.2f}', '#f7e6b8', 1.1, 0.5),
                           path(f'M {-w*.55:.2f} {-L*.4:.2f} Q 0 {-L*.52:.2f} {w*.5:.2f} {-L*.43:.2f} M {-w*.4:.2f} {-L*.7:.2f} L {w*.4:.2f} {-L*.75:.2f}', '#a8803f', 0.7, 0.32)]
        elif sid in METAL or sid == 'knight':
            if name == 'palm' and sid != 'hook':
                shapes += [path('M 23 60 L 29 45 L 40 42 M 70 92 L 78 79', '#f8fafc', 1.6, 0.32, anim=motion(n)),
                           path('M 27 85 L 34 90 M 67 50 L 75 55', '#0f172a', 0.9, 0.22)]
            elif size:
                w, L = size
                shapes += [path(f'M {-w*.38:.2f} {-L*.26:.2f} L {-w*.23:.2f} {-L*.7:.2f}', '#f8fafc', 1.05, 0.38, anim=motion(n, 0.35, 0.8)),
                           path(f'M {-w*.55:.2f} {-L*.14:.2f} Q 0 {-L*.24:.2f} {w*.55:.2f} {-L*.14:.2f}', '#0f172a', 0.9, 0.3)]
        elif sid in CLOTH:
            dark = shapes[0].get('stroke', '#475569')
            if name == 'palm':
                shapes += [path('M 27 76 Q 34 68 42 72 M 61 85 Q 72 76 77 81 M 29 95 Q 49 91 70 96', dark, 1.1, 0.22),
                           path('M 22 60 Q 19 78 32 88 M 35 47 Q 49 44 62 48', '#f8fafc', 2.4, 0.18, anim=motion(n, 0.1, 0.25))]
            else:
                w, L = size
                shapes += [path(f'M {-w*.6:.2f} {-L*.28:.2f} Q 0 {-L*.4:.2f} {w*.58:.2f} {-L*.29:.2f} M {-w*.4:.2f} {-L*.39:.2f} Q 0 {-L*.45:.2f} {w*.3:.2f} {-L*.4:.2f}', dark, 0.9, 0.25),
                           path(f'M {-w*.5:.2f} {-L*.5:.2f} Q {-w*.65:.2f} {-L*.7:.2f} {-w*.3:.2f} {-L*.86:.2f}', '#f8fafc', 1.5 if sid == 'rubber' else 1.1, 0.25 if sid == 'rubber' else 0.16, anim=motion(n, 0.08, 0.2))]
        elif sid in RINGS:
            w, L = size
            import re
            nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', shapes[0]['d'])]
            ys = nums[1::2]; y = (min(ys) + max(ys)) / 2
            shapes += [path(f'M {-w*.4:.2f} {y+1:.2f} L {-w*.05:.2f} {y-1:.2f}', '#f8fafc', 1.0, 0.55, anim=motion(n, 0.45, 0.12))]
        elif sid in NAILS:
            if sid == 'nailpolish':
                w, L = size
                shapes += [path(f'M {-w*.27:.2f} {-L+0.5:.2f} Q {-w*.38:.2f} {-L-1.2:.2f} {-w*.16:.2f} {-L-2.3:.2f}', '#f8fafc', 0.85, 0.5, anim=motion(n, 0.12, 0.18))]
            else:
                for shape in shapes:
                    if shape.get('stroke') in ['#fca5a5', '#fffbeb', '#f8fafc']:
                        shape['anim'] = motion(n, 0.06, 0.18)
        if len(shapes) > 12: raise ValueError(f'{sid}/{name}: too many shapes')
    if '\n' in text.rstrip(): file.write_text(json.dumps(obj, indent=1) + '\n')
    else: file.write_text(json.dumps(obj, separators=(',', ':')) + '\n')
    return sid

if __name__ == '__main__':
    changed = [polish('skins', sid) for sid in ['sand'] + METAL]
    changed += [polish('items', sid) for sid in CLOTH + ['knight'] + RINGS + NAILS]
    print('Material pass:', ', '.join(changed))
