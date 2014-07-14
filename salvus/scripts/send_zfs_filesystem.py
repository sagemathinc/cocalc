#!/usr/bin/env python

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
    remote_snapshots = cmd("ssh %s '%s'"%(remote, ' '.join(s+[remote_filesystem]))).splitlines()

    if len(remote_snapshots) == 0:
        # transfer up to first snapshot to remote
        first = local_snapshots[0]
        system('time zfs send -v %s | ssh %s "zfs recv -F  %s"'%(first, remote, remote_filesystem))
        start = first
    else:
        start = remote_snapshots[-1]

    i = local_snapshots.index(start)
    for j in range(i+1,len(local_snapshots)):
        system('time zfs send -v -i %s %s | ssh %s "zfs recv  %s"'%(local_snapshots[j-1], local_snapshots[j], remote, remote_filesystem))


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Send ZFS filesystems")
    parser.add_argument("remote", help="remote machine's ip address/hostname", type=str)
    parser.add_argument("filesystem", help="name of filesystem to send or name_local:name_remote to send to a different remote name", type=str, nargs="+")
    args = parser.parse_args()

    for filesystem in args.filesystem:
        send(filesystem, args.remote)
