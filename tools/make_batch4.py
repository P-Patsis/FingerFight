#!/usr/bin/env python3
"""Rig-extension items: LONGER FINGERS (nails layer, so it sits with the other finger items). It has no shapes of its own: its `extend` field
makes the rig repeat the worn hand's own mid / tip links beyond each fingertip landmark, so it matches any hand's colours and shape.
Run: python3 tools/make_batch4.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from make_batch1 import tint, write, add_to_manifest, ROOT

def main():
    item = {'format': 1, 'id': 'longfingers', 'name': 'Longer fingers', 'author': 'Finger Fight', 'license': 'CC0 (made for Finger Fight)',
            'layer': 'nails', 'category': 'human',
            'extend': {'len': 0.55, 'pieces': 2, 'droop': 0.2}}
    write(os.path.join(ROOT, 'items', 'longfingers.json'), item)
    add_to_manifest(os.path.join(ROOT, 'items', 'manifest.json'), 'items', ['longfingers'])
    print('wrote longfingers')

if __name__ == '__main__':
    main()
