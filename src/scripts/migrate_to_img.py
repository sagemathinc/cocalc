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



import argparse, hashlib, os, time

from subprocess import Popen, PIPE

def uid(uuid):
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    # 2^31-1=max uid which works with FUSE and node (and Linux, which goes up to 2^32-2).
    n = int(hashlib.sha512(uuid).hexdigest()[:8], 16)
    return n if n>1000 else n+1000

def cmd(s, ignore_errors=False):
    print s
    t = time.time()
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
    x = out.stdout.read() + out.stderr.read()
    e = out.wait()  # this must be *after* the out.stdout.read(), etc. above or will hang when output large!
    print "(%s seconds): %s"%(time.time()-t, x)
    if e:
        if ignore_errors:
            return x + "ERROR"
        else:
            raise RuntimeError(x)
    return x

def migrate_to_img(project_id):
    print "Migrating %s..."%project_id

    filesystem = "projects/%s"%project_id
    mp = '/' + filesystem

    # Mount existing filesystem
    cmd("zfs set mountpoint=%s %s"%(mp,filesystem), ignore_errors=True)
    o = cmd("zfs mount %s"%filesystem, ignore_errors=True)
    if 'ERROR' in o:
        if 'filesystem already mounted' not in o:
            raise RuntimeError(o)

    # get list of snapshots, ordered by creation time
    s = cmd("zfs list -r -t snapshot -o name -s creation %s"%filesystem)
    n = len(filesystem)
    snapshots = [x[n+1:] for x in s.splitlines() if x[n+1:].strip()]

    # create destination container
    filesystem2 = 'images/%s'%project_id
    mp2 = '/' + filesystem2
    cmd('zfs create %s'%filesystem2)
    cmd('zfs set mountpoint=%s %s'%(mp2, filesystem2))

    # create destination sparse image-based pool
    quota = cmd('sudo zfs get quota -H %s'%filesystem).split()[2]
    cmd('truncate -s%s %s/0.img'%(quota,mp2))
    pool = 'project-%s'%project_id
    cmd('zpool create %s %s'%(pool, os.path.abspath('%s/0.img'%mp2)))
    cmd('zfs set dedup=on %s'%pool)
    cmd('zfs set compression=lz4 %s'%pool)
    cmd('zfs set mountpoint=/%s %s'%(pool, pool))

    # copy over each snapshot, chowning as we go.
    u = uid(project_id)
    username = 'tmp0912384092834tmp'
    cmd('userdel %s; groupdel %s'%(username, username), ignore_errors=True)
    cmd('groupadd -g %s -o %s'%(u,username))
    cmd('useradd -u %s -g %s -o %s'%(u,u,username))
    for snapshot in snapshots:
        cmd("rsync -axH --delete /%s/.zfs/snapshot/%s/ /%s/"%(filesystem, snapshot, pool))
        cmd("chown -R %s. /%s/"%(username, pool))
        cmd("zfs snapshot %s@%s"%(pool, snapshot))

    # copy over any live files and chown
    cmd("rsync -axH --delete /%s/ /%s/"%(filesystem, pool))
    cmd("chown -R %s. /%s/"%(username, pool))

    # unmount
    cmd("zfs umount %s"%filesystem, ignore_errors=True)
    cmd("zfs umount %s"%pool)
    cmd("zpool export %s"%pool)

    # delete user
    cmd('userdel %s; groupdel %s'%(username, username), ignore_errors=True)

    # create zfs stream
    now = time.strftime('%Y-%m-%dT%H:%M:%S')
    cmd("zfs snapshot %s@%s"%(filesystem2, now))
    cmd("zfs send -Dv %s@%s | lz4c - > project-%s-%s-to-%s.lz4"%(filesystem2, now, project_id, now, now))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create sparse image zfs format of project, with fixed uid")

    parser.add_argument("project_id", help="UUID of project stored locally on this computer", type=str, nargs="+")

    args = parser.parse_args()
    for project_id in args.project_id:
        migrate_to_img(project_id)


