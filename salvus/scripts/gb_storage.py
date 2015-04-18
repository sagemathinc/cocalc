#!/usr/bin/env python

###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, 2015, William Stein
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

# TODO:
#  - compression
#  - delete old

PROJECTS     = '/projects'
SNAPSHOTS    = '/projects/.snapshots'
BUCKET       = 'gs://smc-gb-storage'
SMC_TEMPLATE = '/projects/sagemathcloud'  # subvolume template for .sagemathcloud

TO        = "-to-"

import os, signal, time
from subprocess import Popen, PIPE

if not os.path.exists(SNAPSHOTS):
    btrfs(['subvolume', 'create', SNAPSHOTS])

def log(s, *args):
    print s%args

def cmd(s, ignore_errors=False, verbose=2, timeout=None, stdout=True, stderr=True):
    if isinstance(s, list):
        s = [str(x) for x in s]
    if verbose >= 1:
        if isinstance(s, list):
            t = [x if len(x.split()) <=1  else "'%s'"%x for x in s]
            log(' '.join(t))
        else:
            log(s)
    t = time.time()

    mesg = "ERROR"
    if timeout:
        mesg = "TIMEOUT: running '%s' took more than %s seconds, so killed"%(s, timeout)
        def handle(*a):
            if ignore_errors:
                return mesg
            else:
                raise KeyboardInterrupt(mesg)
        signal.signal(signal.SIGALRM, handle)
        signal.alarm(timeout)
    try:
        out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
        x = out.stdout.read() + out.stderr.read()
        e = out.wait()  # this must be *after* the out.stdout.read(), etc. above or will hang when output large!
        if e:
            if ignore_errors:
                return (x + "ERROR").strip()
            else:
                raise RuntimeError(x)
        if verbose>=2:
            log(("(%s seconds): %s"%(time.time()-t, x))[:500])
        elif verbose >= 1:
            log("(%s seconds)"%(time.time()-t))
        return x.strip()
    except IOError:
        return mesg
    finally:
        if timeout:
            signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm

def btrfs(args, **kwds):
    return cmd(['btrfs']+args, **kwds)

def gsutil(args, **kwds):
    return cmd(['gsutil']+args, **kwds)

class Project(object):
    def __init__(self, project_id, quota=0, max=0):
        self.project_id    = project_id
        self.quota         = quota
        self.max           = max
        self.tmp_path      = '/tmp/'  # todo --use tmpfile module!  CRITICAL
        self.gs_path       = os.path.join(BUCKET, project_id)
        self.project_path  = os.path.join(PROJECTS, project_id)
        self.snapshot_path = os.path.join(SNAPSHOTS, project_id)
        self.smc_path      = os.path.join(self.project_path, '.sagemathcloud')

    def gs_ls(self):
        # list contents of google cloud storage for this project
        s = gsutil(['ls', self.gs_path], ignore_errors=True)
        if 'matched no objects' in s:
            return []
        else:
            i = len(self.gs_path)
            return list(sorted([x[i+1:] for x in s.splitlines()]))

    def gs_get(self, stream):
        if TO in stream:
            dest = stream.split(TO)[1]
        else:
            dest = stream
        if os.path.exists(os.path.join(self.snapshot_path, dest)):
            # already have it
            return
        target = os.path.join(self.tmp_path, stream)
        try:
            gsutil(['cp', os.path.join(self.gs_path, stream), target])
            btrfs (['receive', '-f', target, self.snapshot_path])
        finally:
            if os.path.exists(target):
                os.unlink(target)

    def gs_rm(self, stream):
        gsutil(['rm', os.path.join(self.gs_path, stream)])

    def gs_put(self, stream):
        if TO in stream:
            snapshot1, snapshot2 = stream.split(TO)
        else:
            snapshot1 = stream; snapshot2 = None
        try:
            log("snapshot1=%s, snapshot2=%s", snapshot1, snapshot2)
            if snapshot2 is None:
                name = snapshot1
                target = os.path.join(self.tmp_path, name)
                btrfs (['send', os.path.join(self.snapshot_path, snapshot1), '-f', target])
            else:
                name ='%s%s%s'%(snapshot1, TO, snapshot2)
                target = os.path.join(self.tmp_path, name)
                btrfs (['send', '-p', os.path.join(self.snapshot_path, snapshot1), os.path.join(self.snapshot_path, snapshot2), '-f', target])
            gsutil(['cp', target, os.path.join(self.gs_path, stream)])
        finally:
            if os.path.exists(target):
                os.unlink(target)

    def snapshot_ls(self):
        if not os.path.exists(self.snapshot_path):
            return []
        else:
            return list(sorted(cmd(['ls', self.snapshot_path]).splitlines()))

    def open(self):
        if not os.path.exists(self.snapshot_path):
            btrfs(['subvolume', 'create', self.snapshot_path])

        # get a list of all streams in GCS
        gs = self.gs_ls()
        gs_snapshots = sum([x.split(TO) for x in gs], [])
        log('gs_snapshots: %s', gs_snapshots)

        # get a list of snapshots we have
        local_snapshots = self.snapshot_ls()
        log('local_snapshots: %s', local_snapshots)

        # determine newest local snapshot that is also in GCS
        if len(local_snapshots) > 0:
            x = set(gs_snapshots)
            i = len(local_snapshots) - 1
            while i >= 1:
                if local_snapshots[i] not in x:
                    i -= 1
                else:
                    break
            newest_local = local_snapshots[i]
        else:
            newest_local = "" # infinitely old

        log("newest_local = %s", newest_local)
        # download all streams from GCS that start >= newest_local
        for stream in gs:
            if newest_local == "" or stream.split(TO)[0] >= newest_local:
                self.gs_get(stream)

        # delete extra snapshots we no longer need
        # TODO

        # make live equal the newest snapshot
        v = self.snapshot_ls()
        if len(v) == 0:
            if not os.path.exists(self.project_path):
                btrfs(['subvolume', 'create', self.project_path])
        else:
            source = os.path.join(self.snapshot_path, v[-1])
            if not os.path.exists(self.project_path):
                btrfs(['subvolume', 'snapshot', source, self.project_path])
            else:
                cmd(["rsync", "-axvH", "--update", source+"/", self.project_path+"/"])

        t = os.path.join(self.project_path, '.snapshots')
        if not os.path.exists(t):
            cmd(["ln", "-s", self.snapshot_path, t])
        if not os.path.exists(self.smc_path):
            btrfs(['subvolume', 'snapshot', SMC_TEMPLATE, self.smc_path])

    def delete_old_snapshots(self):
        #TODO
        return

    def gs_put_sync(self):
        v = self.snapshot_ls()
        print v
        local = [v[0]]
        for i in range(0,len(v)-1):
            local.append("%s%s%s"%(v[i], TO, v[i+1]))
        local_streams = set(local)
        remote_streams = set(self.gs_ls())
        to_delete = [stream for stream in remote_streams if stream not in local_streams]
        to_put    = [stream for stream in local_streams if stream not in remote_streams]

        # TODO: this should be done in parallel
        for stream in to_put:
            self.gs_put(stream)

        print "to_delete=", to_delete
        for stream in to_delete:
            self.gs_rm(stream)

    def save(self):
        # figure out what to call the snapshot
        target = os.path.join(self.snapshot_path, time.strftime("%Y-%m-%d-%H%M%S"))
        log('creating snapshot %s', target)
        # create the snapshot
        btrfs(['subvolume', 'snapshot', '-r', self.project_path, target])
        # delete old snapshots
        self.delete_old_snapshots()
        # sync gs with local snapshots
        self.gs_put_sync()

    def delete_snapshot(self, snapshot):
        target = os.path.join(self.snapshot_path, snapshot)
        btrfs(['subvolume', 'delete', target])
        # sync with gs
        self.gs_put_sync()

    def close(self):
        # delete snapshots
        for x in self.snapshot_ls():
            btrfs(['subvolume', 'delete', os.path.join(self.snapshot_path, x)])
        if os.path.exists(self.snapshot_path):
            btrfs(['subvolume','delete', self.snapshot_path])
        # delete .sagemathcloud
        if os.path.exists(self.smc_path):
            btrfs(['subvolume','delete', self.smc_path])
        # delete live
        if os.path.exists(self.project_path):
            btrfs(['subvolume','delete', self.project_path])

    def destroy(self):
        # delete locally
        self.close()
        # delete from the cloud
        gsutil(['rm', '-R', self.gs_path])

if __name__ == "__main__":

    import argparse
    parser = argparse.ArgumentParser(description="BTRFS-GoogleCloudStorage backed project storage subsystem")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser_open = subparsers.add_parser('open', help='')
    parser_open.add_argument("--quota", help="quota in MB", default=0, type=int)
    parser_open.add_argument("project_id", help="", type=str)
    parser_open.set_defaults(func=lambda args: Project(args.project_id, quota=args.quota).open())

    parser_close = subparsers.add_parser('close', help='')
    parser_close.add_argument("--max", help="maximum number of snapshots", dest="max", default=0, type=int)
    parser_close.add_argument("project_id", help="close this project removing all files from this local host (does NOT save first)", type=str)
    parser_close.set_defaults(func=lambda args: Project(args.project_id).close())

    parser_destroy = subparsers.add_parser('destroy', help='')
    parser_destroy.add_argument("project_id", help="completely destroy this project **EVERYWHERE** -- can't be undone", type=str)
    parser_destroy.set_defaults(func=lambda args: Project(args.project_id).destroy())

    parser_save = subparsers.add_parser('save', help='')
    parser_save.add_argument("--max", help="maximum number of snapshots", default=0, type=int)
    parser_save.add_argument("project_id", help="", type=str)
    parser_save.set_defaults(func=lambda args: Project(args.project_id, max=args.max).save())

    parser_delete_snapshot = subparsers.add_parser('delete_snapshot', help='delete a particular snapshot')
    parser_delete_snapshot.add_argument("snapshot", help="snapshot to delete", type=str)
    parser_delete_snapshot.add_argument("project_id", help="", type=str)
    parser_delete_snapshot.set_defaults(func=lambda args: Project(args.project_id).delete_snapshot(args.snapshot))

    args = parser.parse_args()
    args.func(args)



