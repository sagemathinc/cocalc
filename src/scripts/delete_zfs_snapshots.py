#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



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

