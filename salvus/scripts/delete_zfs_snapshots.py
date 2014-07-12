#!/usr/bin/env python

# Delete all snapshots of a given ZFS filesystem but **NOT** of descendant filesystems
# Or -- if filesystem='90d', delete all snapshots of all filesystems whose name ends in "--90d".

import sys, time
from subprocess import Popen, PIPE


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

def delete_snapshots(filesystem):

    if filesystem == '90d':
        print "deleting all snapshots of any filesystem in any pool that contain '--90d\\t'"
        x = cmd(['zfs', 'list', '-H', '-r', '-t', 'snapshot'])

        # take only those ending in --90d
        lines = [t for t in x.splitlines() if '--90d\t'in t]

    else:
        print "deleting snapshots of filesystem %s"%filesystem
        x = cmd(['zfs', 'list', '-H', '-r', '-t', 'snapshot', filesystem])

        # get rid of descendant filesystems in list.
        lines = [t for t in x.splitlines() if filesystem+"@" in t]

    total = len(lines)
    print "%s snapshots to delete"%total

    i = 0
    for a in lines:
        if a:
            snapshot = a.split()[0]
            print snapshot
            cmd(['zfs', 'destroy', snapshot])
            i += 1
            print "%s/%s"%(i,total)

for filesystem in sys.argv[1:]:
    delete_snapshots(filesystem)

