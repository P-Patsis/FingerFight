#!/usr/bin/env python3
"""Idle animations (Part C): adds a small `anim` to chosen shapes of the built-in hands, by simple rules. Idempotent. Run it AFTER the generators
(make_batch1 / 3 / 5, make_gridmesh), because they rewrite the files without animations. Geometric and Painting are animated in js/generated.js.
Animations are cheap on purpose (opacity pulses, tiny drifts, gear spins, blinks); the rig draws them only while a live hand is on screen, and not
under reduced motion or on a slow phone. Run: python3 tools/make_anims.py"""
import json, os, re

SK = os.path.join(os.path.dirname(__file__), '..', 'assets', 'skins')
r2 = lambda v: round(v, 2)

def nums(d): return [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', d)]
def kind(s):
    d = s['d']
    if d.count('L') >= 25: return 'gear'
    if d.count(' A ') == 2 and 'L' not in d: return 'circle'
    return 'path'
def centre(d):
    n = nums(d); xs, ys = n[0::2], n[1::2]
    return r2(sum(xs) / len(xs)), r2(sum(ys) / len(ys))

def rules(skin_id):
    """skin id -> function(shape, n) -> anim dict or None; n counts the shapes that matched the rule's group before this one."""
    ph = lambda n, k=0.9: r2((n * k) % 6.28)
    R = {
        'neon':      lambda s, n, st: {'pulse': [0.45, 0.5, ph(n)]} if s.get('opacity') == 0.3 and s.get('stroke') == '#22d3ee' else None,
        'robot':     lambda s, n, st: {'pulse': [0.7, 0.35, ph(n)]} if kind(s) == 'circle' and s.get('fill') == '#e2e8f0' else None,
        'gauntlet':  lambda s, n, st: {'pulse': [0.45, 0.55, 0]} if (s.get('stroke') == '#f59e0b' and s.get('opacity') == 0.3) or (kind(s) == 'circle' and s.get('fill') == '#fbbf24') else None,
        'goldhand':  lambda s, n, st: {'pulse': [0.3, 0.5, ph(n, 0.5)]} if s.get('stroke') == '#fef08a' else None,
        'dragon':    lambda s, n, st: {'pulse': [0.2, 0.25, ph(n, 0.6)]} if s.get('stroke') == '#2f6b36' else None,
        'duck':      lambda s, n, st: {'drift': [0.6, 0.4, 0.35, 0]} if s.get('fill') == '#fde68a' else None,
        'frog':      lambda s, n, st: {'pulse': [0.25, 0.2, ph(n, 0.7)]} if kind(s) == 'circle' and s.get('fill') == '#a7e07f' else None,
        'toybrick':  lambda s, n, st: {'drift': [0, 1.2, 0.3, ph(n // 2, 1.1)]} if kind(s) == 'circle' and s.get('fill') in ('#ef4444', '#fca5a5') else None,       # a stud = body + highlight, consecutive: they bob together
        'mechanical': lambda s, n, st: {'spin': [*centre(s['d']), r2((0.5 if st['part'] == 'palm' else 1.1) * (1 if n % 2 == 0 else -1))]} if kind(s) == 'gear' else None,
        'cyberpunk': lambda s, n, st: {'pulse': [0.9, 0.6, ph(n, 0.7)]} if (s.get('stroke') == '#22d3ee' and s.get('strokeWidth') in (1.3, 1.6)) or (s.get('fill') == '#22d3ee' and not s.get('stroke')) else None,
        'bone':      lambda s, n, st: {'pulse': [0.2, 0.12, ph(n)]} if kind(s) == 'circle' and s.get('fill') == '#f1ead8' else None,
        'burnbone':  lambda s, n, st: {'pulse': [0.2, 0.12, ph(n)]} if kind(s) == 'circle' and s.get('fill') == '#f1ead8' else None,
        'inksketch': lambda s, n, st: {'drift': [0.7, 0.5, 0.8, ph(n, 1.7)]} if s.get('stroke') == '#111827' and s.get('strokeWidth') in (0.9, 1.2) else None,
        'gridmesh':  lambda s, n, st: ({'pulse': [0.35, 0.8, ph(n, 0.8)]} if s.get('opacity') == 0.12 else {'pulse': [0.5, 0.3, ph(n, 0.5)]} if s.get('stroke') == '#22d3ee' else None),
        'flaming':   lambda s, n, st: {'drift': [0.6, 0.9, 1.3, ph(n, 1.3)]} if s.get('fill') in ('#f97316', '#fde047') and s.get('opacity') in (0.85, 0.9, None) and s['d'].count('Q') == 4 else None,
    }
    return R.get(skin_id)

def blink_groups(j):
    """Eyes: every eye is three shapes in a row (white, iris, pupil); each blinks about its own centre, out of step with the others."""
    n = 0
    for name, p in j['parts'].items():
        if 'shapes' not in p: continue
        shapes = p['shapes']
        for i, s in enumerate(shapes):
            if s.get('fill') == '#ffffff' and kind(s) == 'path' and 'Q' in s['d']:
                cy = nums(s['d'])[1]
                period, phase = r2(4.2 + 0.9 * (n % 4)), r2(1.3 * n)
                for t in shapes[i:i + 3]: t['anim'] = {'blink': [r2(cy), period, phase]}
                n += 1
    return n

def main():
    done = {}
    for fn in sorted(os.listdir(SK)):
        if not fn.endswith('.json') or fn == 'manifest.json': continue
        sid = fn[:-5]; path = os.path.join(SK, fn)
        with open(path) as fh: j = json.load(fh)
        count = 0
        if sid == 'eyes': count = blink_groups(j)
        else:
            rule = rules(sid)
            if rule:
                n = 0
                for name, p in j['parts'].items():
                    if 'shapes' not in p: continue
                    for s in p['shapes']:
                        a = rule(s, n, {'part': name})
                        if a: s['anim'] = a; n += 1; count += 1
                        else: s.pop('anim', None)
        if count:
            with open(path, 'w') as fh: json.dump(j, fh, indent=1); fh.write('\n')
            done[sid] = count
    print('animated shapes:', done)

if __name__ == '__main__':
    main()
