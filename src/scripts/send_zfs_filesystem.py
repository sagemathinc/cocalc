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



# This is a very conservative approach to sending a ZFS filesystem from one machine to another,
# with exactly the same name on each side, and not including subfilesystems recursively.
# It determines snapshots locally and remotely.
# It sends first snapshot, if nothing exists remotely.  Then...
# Then it does this from local for each successive snapshot a0 a1:
#
#      time zfs send -v -i a0 a1 | ssh remote "zfs recv filesystem"
#
# If this fails (e.g., due to network/buffer issues), it will retry the
# number of times giving by the RETRIES parameter:

RETRIES=2

# Why not just use "zfs send -I"?  Because it often doesn't work.  Simple as that.
# The main reason for existence of this script is due to zfsonlinux being still
# somewhat broken.

import argparse,os, sys, time
from subprocess import Popen, PIPE

def cmd(v):
    t = time.time()
    print v if isinstance(v, str) else ' '.join(v),
    sys.stdout.flush()
    out = Popen(v,stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=isinstance(v,str))
    x = out.stdout.read()
    y = out.stderr.read()
    e = out.wait()
    if e:
        raise RuntimeError(y)
    print "    (%.2f seconds)"%(time.time()-t)
    return x

def system(c):
    for n in range(RETRIES):
        print c
        if not os.system(c):
            return
    raise RuntimeError('error running "%s" %s times'%(c, RETRIES))

def send(filesystem, remote):
    if ':' in filesystem:
        local_filesystem, remote_filesystem = filesystem.split(':')
    else:
        local_filesystem = remote_filesystem = filesystem
    print "sending %s to %s on %s"%(local_filesystem, remote_filesystem, remote)

    # get list of snapshots locally, sorted by time.
    s = ['zfs', 'list', '-r', '-H', '-t', 'snapshot', '-o', 'name', '-s', 'creation']
    local_snapshots = cmd(s+[local_filesystem]).splitlines()

    if len(local_snapshots) == 0:
        #TODO
        raise RuntimeError("you must have at least one local snapshot of %s"%local_filesystem)

    # get list of snapshots remotely, sorted by time
    if remote == 'localhost':
        remote_snapshots = cmd(' '.join(s+[remote_filesystem])).splitlines()
    else:
        remote_snapshots = cmd("ssh %s '%s'"%(remote, ' '.join(s+[remote_filesystem]))).splitlines()

    local_snapshot_names = set([x.split('@')[1] for x in local_snapshots])

    if len(remote_snapshots) == 0:
        # transfer up to first snapshot to remote
        first = local_snapshots[0]
        if remote == 'localhost':
            system('time zfs send -v %s | zfs recv -F  %s'%(first, remote_filesystem))
        else:
            system('time zfs send -v %s | ssh %s "zfs recv -F  %s"'%(first, remote, remote_filesystem))
        start = first
    else:
        # transfer starting with newest snapshot this available locally (destructively killing all older snapshots).
        i = len(remote_snapshots)-1
        while i>=0 and remote_snapshots[i].split('@')[1] not in local_snapshot_names:
            i -= 1
        if i == -1:
            start = local_snapshots[0]
        else:
            start = remote_snapshots[i]

    i = local_snapshots.index("%s@%s"%(local_filesystem, start.split('@')[1]))
    v = range(i+1,len(local_snapshots))
    n = 1
    for j in v:
        print "(%s/%s) sending %s"%(n, len(v), local_snapshots[j])
        if remote == 'localhost':
            system('time zfs send -v -i %s %s | zfs recv -F %s'%(local_snapshots[j-1], local_snapshots[j], remote_filesystem))
        else:
            system('time zfs send -v -i %s %s | ssh %s "zfs recv -F %s"'%(local_snapshots[j-1], local_snapshots[j], remote, remote_filesystem))
        n += 1


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Send ZFS filesystems")
    parser.add_argument("remote", help="remote machine's ip address/hostname (or localhost)", type=str)
    parser.add_argument("filesystem", help="name of filesystem to send or name_local:name_remote to send to a different remote name", type=str, nargs="+")
    args = parser.parse_args()

    for filesystem in args.filesystem:
        send(filesystem, args.remote)
