#!/usr/bin/env python

# Delete all snapshots of a given ZFS filesystem but **NOT** of descendant filesystems

import sys, time
from subprocess import Popen, PIPE

filesystem = sys.argv[1]

def cmd(v):
    t = time.time()
    print ' '.join(v),
    sys.stdout.flush()
    out = Popen(v,stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=False)
    x = out.stdout.read()
    y = out.stderr.read()
    e = out.wait()
    if e:
        raise RuntimeError(y)
    print "    (%.2f seconds)"%(time.time()-t)
    return x

x = cmd(['zfs', 'list', '-H', '-r', '-t', 'snapshot', filesystem])

# get rid of descendant filesystems in list.
lines = [t for t in x.splitlines() if filesystem+"@" in t]

total = len(lines)
print "%s snapshots"%total

i = 0
for a in lines:
    if a:
        snapshot = a.split()[0]
        print snapshot
        cmd(['zfs', 'destroy', snapshot])
        i += 1
        print "%s/%s"%(i,total)

