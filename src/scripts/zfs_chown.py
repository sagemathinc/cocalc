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




import argparse, time

from subprocess import Popen, PIPE


def cmd(s, ignore_errors=False):
    print s
    t = time.time()
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
    x = out.stdout.read() + out.stderr.read()
    e = out.wait()  # this must be *after* the out.stdout.read(), etc. above or will hang when output large!
    print "(%s seconds): %s"%(time.time()-t, x)
    if e and not ignore_errors:
        raise RuntimeError(x)
    return x

def chown(username, filesystem):
    new_filesystem = filesystem + "-chown"

    # get list of snapshots, ordered by creation time
    s = cmd("zfs list -r -t snapshot -o name -s creation %s"%filesystem)
    n = len(filesystem)
    snapshots = [x[n+1:] for x in s.splitlines() if x[n+1:].strip()]

    # get mountpoint
    mp = cmd("zfs get mountpoint %s"%filesystem).splitlines()[1].split()[2]
    if mp == "none":
        mp = '/' + filesystem

    cmd("zfs set mountpoint=%s %s"%(mp, filesystem))
    cmd("zfs mount %s"%filesystem, ignore_errors=True)

    # create destination filesystem
    cmd("zfs destroy -r %s"%new_filesystem, ignore_errors=True)
    cmd("zfs create %s"%new_filesystem)

    # copy over each snapshot, chowning as we go.
    for snapshot in snapshots:
        cmd("rsync -axH --delete /%s/.zfs/snapshot/%s/ /%s/"%(filesystem, snapshot, new_filesystem))
        cmd("chown -R %s. /%s/"%(username, new_filesystem))
        cmd("zfs snapshot %s@%s"%(new_filesystem, snapshot))

    # copy over live files and chown
    cmd("rsync -axH --delete /%s/ /%s/"%(filesystem, new_filesystem))
    cmd("chown -R %s. /%s/"%(username, new_filesystem))

    # unmount
    cmd("zfs umount %s"%filesystem)
    cmd("zfs umount %s"%new_filesystem)

    # move orig out of the way and new to orig
    cmd("zfs destroy -r %s-chown-TRASH"%filesystem, ignore_errors=True)
    cmd("zfs rename %s %s-chown-TRASH"%(filesystem, filesystem))
    cmd("zfs rename %s %s"%(new_filesystem, filesystem))

    cmd("zfs set mountpoint=%s %s"%(mp,filesystem))
    cmd("zfs mount %s"%filesystem, ignore_errors=True)

    print "Done.  You can delete the original filesystem by typing"
    print "zfs destroy -r %s-chown-TRASH"%filesystem


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="create chowned version of a zfs filesystem")

    parser.add_argument("username", help="a unix username", type=str)
    parser.add_argument("filesystem", help="a ZFS filesystem", type=str)

    args = parser.parse_args()

    chown(username=args.username, filesystem=args.filesystem)


