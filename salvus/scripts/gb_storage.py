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

PROJECTS  = '/projects'
SNAPSHOTS = '/projects/.snapshots'
BUCKET    = 'gs://smc-gb-storage'

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
        self.gs_path       = os.path.join(BUCKET, project_id)
        self.project_path  = os.path.join(PROJECTS, project_id)
        self.snapshot_path = os.path.join(SNAPSHOTS, project_id)

    def gs_ls(self):
        # list contents of google cloud storage for this project
        s = gsutil(['ls', self.gs_path], ignore_errors=True)
        if 'matched no objects' in s:
            return []
        else:
            i = len(path)
            return [x[i+1:] for x in s.splitlines()]

    def snapshots_ls(self):
        if not os.path.exists(self.snapshot_path):
            return []
        else:
            return cmd(['ls', self.snapshot_path]).splitlines()

    def open(self):
        if not os.path.exists(self.snapshot_path):
            btrfs(['subvolume', 'create', self.snapshot_path])

        # get a list of all streams in GCS
        gs = self.gs_ls()
        log('gs_ls: %s', gs)

        # get a list of snapshots we have
        snapshots = self.snapshots_ls()
        log('snapshots: %s', snapshots)

        # download needed snapshots from GCS

        # receive needed snapshots

        # delete extra snapshots we no longer need

        # make live equal the newest snapshot (could use rsync --update to make nondestructive if already there?)






    def save_project(self, project_id, quota):
        log("save_project(%s,%s)"%(project_id, quota))


if __name__ == "__main__":

    import argparse
    parser = argparse.ArgumentParser(description="BTRFS-GoogleCloudStorage backed project storage subsystem")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser_open = subparsers.add_parser('open', help='')
    parser_open.add_argument("--quota", help="quota in MB", dest="quota", default=0, type=int)
    parser_open.add_argument("project_id", help="", type=str)
    parser_open.set_defaults(func=lambda args: Project(args.project_id, quota=args.quota).open())

    parser_open = subparsers.add_parser('save', help='')
    parser_open.add_argument("--max", help="maximum number of snapshots", dest="max", default=0, type=int)
    parser_open.add_argument("project_id", help="", type=str)
    parser_open.set_defaults(func=lambda args: Project(args.project_id, max=args.max).save())

    args = parser.parse_args()
    args.func(args)



