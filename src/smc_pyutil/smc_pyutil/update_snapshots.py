#!/usr/bin/env python

import json, os, sys
join = os.path.join

SNAPSHOTS = join(os.environ['HOME'], '.snapshots')
MNT = "/mnt/snapshots/"

project_id = json.loads(open(join(os.environ['SMC'], 'info.json')).read())['project_id']

def find_snapshots():
    listing_file = join(MNT,'listing')
    if not os.path.exists(listing_file):
        return []
    for x in open(listing_file).read().split('\n\n'):
        v = x.split()
        if len(v) > 1:
            path = join(MNT, v[0][:-1])
            recent = v[-1]
            if os.path.exists(join(path, recent, project_id)):
                return path, v[1:]


def update_snapshots():
    z = find_snapshots()
    if not z:  # nothing
        return
    [path, snapshots] = z
    if not os.path.exists(SNAPSHOTS):
        os.makedirs(SNAPSHOTS)
    valid = set(snapshots)
    current = set(os.listdir(SNAPSHOTS))
    for s in current:
        if s not in valid:
            try:
                os.unlink(s)
            except:
                pass

    n = len("2015-12-13-215220")
    current_trunc = set([x[:n] for x in current])
    for s in snapshots:
        if s[:n] not in current_trunc:
            current_trunc.add(s[:n])
            target = join(MNT, path, s, project_id)
            if os.path.exists(target):
                os.symlink(target, join(SNAPSHOTS, s))

