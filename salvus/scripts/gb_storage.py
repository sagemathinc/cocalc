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
#
#  - [x] compression of files: mount with mount -o compress-force=lzo,noatime /dev/sdb /projects
#  - [x] compression of streams: lrz or lz4?
#  - [x] time option to save
#  - [x] download all needed files from GCS before receiving them, so can get them in parallel.
#  - [x] proper temporary directory
#  - [ ] start migrating projects
#  - [ ] (1:00?) delete excessive snapshots: ???
#  - [ ] (0:20?) instructions for making/mounting filesystem
#  - [ ] (2:00?) carry over all functionality *needed* from bup_storage.py
#
# MAYBE:
#  - support 3 tiers of storage: /projects/ssd, /projects/hdd, /projects/ssd-local
#

"""
mkfs.btrfs /dev/sdb
mount -o compress=lzo /dev/sdb /projects
btrfs subvolume create /projects/sagemathcloud
rsync -LrxvH /home/salvus/salvus/salvus/local_hub_template/ /projects/sagemathcloud/

"""

PROJECTS     = '/projects'
SNAPSHOTS    = '/projects/.snapshots'
BUCKET       = 'gs://smc-gb-storage'
SMC_TEMPLATE = '/projects/sagemathcloud'  # subvolume template for .sagemathcloud

TO        = "-to-"

import os, re, shutil, signal, tempfile, time, uuid
from subprocess import Popen, PIPE

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
            log("(%s seconds): %s", time.time()-t, x[:500])
        elif verbose >= 1:
            log("(%s seconds)", time.time()-t)
        return x.strip()
    except IOError:
        return mesg
    finally:
        if timeout:
            signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm

def thread_map(callable, inputs):
    """
    Computing [callable(args) for args in inputs]
    in parallel using len(inputs) separate *threads*.

    If an exception is raised by any thread, a RuntimeError exception
    is instead raised.
    """
    print "Doing the following in parallel:\n%s"%('\n'.join([str(x) for x in inputs]))
    from threading import Thread
    class F(Thread):
        def __init__(self, x):
            self._x = x
            Thread.__init__(self)
            self.start()
        def run(self):
            try:
                self.result = callable(self._x)
                self.fail = False
            except Exception, msg:
                self.result = msg
                self.fail = True
    results = [F(x) for x in inputs]
    for f in results: f.join()
    e = [f.result for f in results if f.fail]
    if e: raise RuntimeError(e)
    return [f.result for f in results]

def btrfs(args, **kwds):
    return cmd(['btrfs']+args, **kwds)

if not os.path.exists(SNAPSHOTS):
    btrfs(['subvolume', 'create', SNAPSHOTS])

def gsutil(args, **kwds):
    return cmd(['gsutil']+args, **kwds)

class Project(object):
    def __init__(self, project_id, quota=0, max=0):
        try:
            u = uuid.UUID(project_id)
            assert u.get_version() == 4
            project_id = str(u)  # leaving off dashes still makes a valid uuid in python
        except (AssertionError, ValueError):
            raise RuntimeError("invalid project uuid='%s'"%project_id)
        self.project_id    = project_id
        self.quota         = quota
        self.max           = max
        self.gs_path       = os.path.join(BUCKET, project_id, 'v0')
        self.project_path  = os.path.join(PROJECTS, project_id)
        self.snapshot_path = os.path.join(SNAPSHOTS, project_id)
        self.smc_path      = os.path.join(self.project_path, '.sagemathcloud')

    def gs_version(self):
        try:
            return self._gs_version
        except:
            v = self.snapshot_ls()
            if len(v) == 0:
                # set from newest on GCS
                i = len(self.gs_path) + 1
                a = [x[i:] for x in sorted(gsutil(['ls', self.gs_path]).splitlines())]
                self._gs_version = a[-1].strip('/')
            else:
                s = cmd("btrfs subvolume show %s|grep Creation"%os.path.join(self.snapshot_path, v[0]))
                i = s.find(":")
                self._gs_version = s[i+1:].strip().replace(' ','-').replace(':','')
            return self._gs_version

    def gs_ls(self):
        # list contents of google cloud storage for this project
        try:
            p = os.path.join(self.gs_path, self.gs_version())
            s = gsutil(['ls', p], ignore_errors=False)
            i = len(p) + 1
            return list(sorted([x[i:] for x in s.splitlines()]))
        except Exception, mesg:
            if 'matched no objects' in str(mesg):
                return []
            else:
                raise

    def gs_get(self, streams):
        targets = []
        sources = []
        tmp_path = tempfile.mkdtemp()
        try:
            for stream in streams:
                if TO in stream:
                    dest = stream.split(TO)[1]
                else:
                    dest = stream
                if os.path.exists(os.path.join(self.snapshot_path, dest)):
                    # already have it
                    continue
                else:
                    sources.append(os.path.join(self.gs_path, self.gs_version(), stream))
                targets.append(os.path.join(tmp_path, stream))
            if len(sources) == 0:
                return sources
            # Get all the streams we need (in parallel).
            # We parallelize at two levels because just using gsutil -m cp with say 100 or so
            # inputs causes it to HANG every time.  On the other hand, using thread_map for
            # everything quickly uses up all RAM on the computer.  The following is a tradeoff.
            # Also, doing one at a time is ridiculously slow.
            s = max(15, min(50, len(sources)//5))
            def f(v):
                if len(v) > 0:
                    return gsutil(['-q', '-m', 'cp'] + v +[tmp_path])
            thread_map(f, [sources[s*i:s*(i+1)] for i in range(len(sources)//s + 1)])

            # apply them all
            for target in targets:
                cmd("cat %s | lz4c -d | btrfs receive %s"%(target, self.snapshot_path))
                os.unlink(target)

            return sources
        finally:
            shutil.rmtree(tmp_path)

    def gs_rm(self, stream):
        gsutil(['rm', os.path.join(self.gs_path, self.gs_version(), stream)])

    def gs_put(self, stream):
        if TO in stream:
            snapshot1, snapshot2 = stream.split(TO)
        else:
            snapshot1 = stream; snapshot2 = None
        tmp_path = tempfile.mkdtemp()
        try:
            log("snapshot1=%s, snapshot2=%s", snapshot1, snapshot2)
            if snapshot2 is None:
                name = snapshot1
                target = os.path.join(tmp_path, name)
                cmd("btrfs send '%s' | lz4c > %s"%(os.path.join(self.snapshot_path, snapshot1), target))
            else:
                name ='%s%s%s'%(snapshot1, TO, snapshot2)
                target = os.path.join(tmp_path, name)
                cmd("btrfs send -p %s %s | lz4c > %s"%(os.path.join(self.snapshot_path, snapshot1),
                                   os.path.join(self.snapshot_path, snapshot2), target))

            gsutil(['-q', '-m', 'cp', target, os.path.join(self.gs_path, self.gs_version(), stream)])
        finally:
            shutil.rmtree(tmp_path)

    def snapshot_ls(self):
        if not os.path.exists(self.snapshot_path):
            return []
        else:
            return list(sorted(cmd(['ls', self.snapshot_path]).splitlines()))

    def create_snapshot_link(self):
        t = os.path.join(self.project_path, '.snapshots')
        if not os.path.exists(t):
            cmd(["ln", "-s", self.snapshot_path, t])

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
        # download all streams from GCS with start >= newest_local
        missing_streams = [stream for stream in gs if newest_local == "" or stream.split(TO)[0] >= newest_local]
        downloaded = self.gs_get(missing_streams)

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
                if len(downloaded) > 0:
                    # only do this if we actually got something new from gs.
                    cmd(["rsync", "-axH", "--update", source+"/", self.project_path+"/"])

        self.create_snapshot_link()
        if not os.path.exists(self.smc_path):
            if not os.path.exists(SMC_TEMPLATE):
                log("WARNING: skipping creating %s since %s doesn't exist"%(self.smc_path, SMC_TEMPLATE))
            else:
                btrfs(['subvolume', 'snapshot', SMC_TEMPLATE, self.smc_path])
                # TODO: need to chown SMC_TEMPLATE so user can actually use it.

        self.gs_put_sync()

    def delete_old_snapshots(self):
        #TODO
        return

    def gs_put_sync(self):
        v = self.snapshot_ls()
        if len(v) == 0:
            local_streams = set([])
        else:
            local = [v[0]]
            for i in range(0,len(v)-1):
                local.append("%s%s%s"%(v[i], TO, v[i+1]))
            local_streams = set(local)
        remote_streams = set(self.gs_ls())
        to_delete = [stream for stream in remote_streams if stream not in local_streams]
        to_put    = [stream for stream in local_streams if stream not in remote_streams]

        # TODO: MAYBE this should be done in parallel -- though it is a save, so not time critical.
        # And doing it in parallel could thrash io and waste RAM.
        for stream in to_put:
            self.gs_put(stream)

        for stream in to_delete:
            self.gs_rm(stream)

    def save(self, timestamp="", persist=False):
        if not timestamp:
            timestamp = time.strftime("%Y-%m-%d-%H%M%S")
        # figure out what to call the snapshot
        target = os.path.join(self.snapshot_path, timestamp)
        if persist:
            target += "-persist"
        log('creating snapshot %s', target)
        # create the snapshot
        btrfs(['subvolume', 'snapshot', '-r', self.project_path, target])
        self.delete_old_snapshots()
        self.sync()

    def sync(self):
        # ensure subvolume written to disk
        cmd("sync")
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
        try:
            gsutil(['rm', '-R', self.gs_path])
        except Exception, mesg:
            if 'No URLs matched' not in str(mesg):
                raise

    def deduplicate(self):
        """
        Deduplicate the live filesystem.

        Uses https://github.com/markfasheh/duperemove

        I tested this on an SSD on a 16GB project with three sage installs,
        and it took 1.5 hours, and saved about 4GB.  So this isn't something
        to just use lightly, or possibly ever.
        """
        # we use os.system, since the output is very verbose...
        os.system("duperemove -h -d -r '%s'/*"%self.project_path)

    def exclude(self, prefix, prog='rsync'):
        eprefix = re.escape(prefix)
        excludes = ['core', '.sage/cache', '.fontconfig', '.sage/temp', '.zfs', '.npm', '.sagemathcloud', '.node-gyp', '.cache', '.forever', '.snapshots', '.trash']
        exclude_rxs = []
        if prog == 'rsync':
            excludes.append('*.sage-backup')
        else: # prog == 'bup'
            exclude_rxs.append(r'.*\.sage\-backup')

        for i,x in enumerate(exclude_rxs):
            # escape the prefix for the regexs
            ex_len = len(re.escape(x))
            exclude_rxs[i] = re.escape(os.path.join(prefix, x))
            exclude_rxs[i] = exclude_rxs[i][:-ex_len]+x

        return ['--exclude=%s'%os.path.join(prefix, x) for x in excludes] + ['--exclude-rx=%s'%x for x in exclude_rxs]


    def migrate(self, update=False, source='gsutil'):
        if not update:
            try:
                cmd("gsutil ls %s"%self.gs_path)
                log("already migrated")
                return
            except:
                pass
        else:
            raise NotImplementedError
        try:
            tmp_dirs = []
            if source == 'gsutil':
                cmd("gsutil cp gs://smc-projects/%s.tar . && ls -lh %s.tar"%(self.project_id, self.project_id))
                cmd("tar xf %s.tar"%self.project_id)
                os.unlink("%s.tar"%self.project_id)
            else:
                cmd("tar xf %s/%s.tar"%(source, self.project_id))
            tmp_dirs.append(self.project_id)
            cmd("bup -d %s ls master/latest"%self.project_id) # error out immediately if bup repo no good
            self.open()
            if len(self.snapshot_ls()) == 0:
                # new migration
                cmd("bup -d %s restore --outdir=%s/ master/latest/"%(self.project_id, self.project_path))
            else:
                # udpate existing migrated.
                cmd("bup -d %s restore --outdir=%s-out/ master/latest/"%(self.project_id, self.project_id))
                cmd("rsync -axH --delete %s-out/ %s/"%(self.project_id, self.project_path))
                tmp_dirs.append("%s-out"%self.project_id)
            self.save(timestamp=cmd("bup -d %s ls master/|tail -2|head -1"%self.project_id).strip())
        finally:
            for x in tmp_dirs:
                log("removing %s"%x)
                shutil.rmtree(x)
            self.close()

    def migrate_live(self, hostname, port=22, close=False, verbose=False):
        try:
            self.open()
            if ':' in hostname:
                remote = hostname
            else:
                remote = "%s:/projects/%s"%(hostname, self.project_id)
            s = "rsync -%szaxH --max-size=50G --delete-excluded --delete --ignore-errors %s -e 'ssh -o StrictHostKeyChecking=no -p %s' %s/ %s/ </dev/null"%('v' if verbose else '', ' '.join(self.exclude('')), port, remote, self.project_path)
            log(s)
            if not os.system(s):
                log("migrate_live --- WARNING: rsync issues...")   # these are unavoidable with fuse mounts, etc.
            self.create_snapshot_link()  # rsync deletes this
            self.save()
        finally:
            if close:
                self.close()

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
    parser_save.add_argument("--timestamp", help="optional timestamp in the form %Y-%m-%d-%H%M%S", default="", type=str)
    parser_save.add_argument("--persist", help="if given, won't automatically delete",
                             default=False, action="store_const", const=True)
    parser_save.add_argument("project_id", help="", type=str)
    parser_save.set_defaults(func=lambda args: Project(args.project_id, max=args.max).save(timestamp=args.timestamp, persist=args.persist))

    parser_sync = subparsers.add_parser('sync', help='')
    parser_sync.add_argument("project_id", help="sync project with GCS, without first saving a new snapshot", type=str)
    parser_sync.set_defaults(func=lambda args: Project(args.project_id).sync())

    parser_delete_snapshot = subparsers.add_parser('delete_snapshot', help='delete a particular snapshot')
    parser_delete_snapshot.add_argument("snapshot", help="snapshot to delete", type=str)
    parser_delete_snapshot.add_argument("project_id", help="", type=str)
    parser_delete_snapshot.set_defaults(func=lambda args: Project(args.project_id).delete_snapshot(args.snapshot))

    parser_deduplicate = subparsers.add_parser('deduplicate', help='deduplicate live project (WARNING: could take hours!)')
    parser_deduplicate.add_argument("project_id", help="", type=str)
    parser_deduplicate.set_defaults(func=lambda args: Project(args.project_id).deduplicate())

    parser_migrate = subparsers.add_parser('migrate', help='migrate project to new format')
    parser_migrate.add_argument("--source", help="path to directory of project_id.tar bup repos or 'gsutil'", default="gsutil", type=str)
    parser_migrate.add_argument("project_id", help="", type=str)
    parser_migrate.set_defaults(func=lambda args: Project(args.project_id).migrate(source=args.source))

    parser_migrate_live = subparsers.add_parser('migrate_live', help='')
    parser_migrate_live.add_argument("--port", help="path to directory of project_id.tar bup repos or 'gsutil'", default=22, type=int)
    parser_migrate_live.add_argument("--verbose", default=False, action="store_const", const=True)
    parser_migrate_live.add_argument("--close", help="if given, close project after updating (default: DON'T CLOSE)",
                                     default=False, action="store_const", const=True)
    parser_migrate_live.add_argument("hostname", help="hostname[:path]", type=str)
    parser_migrate_live.add_argument("project_id", help="", type=str)
    parser_migrate_live.set_defaults(func=lambda args: Project(args.project_id).migrate_live(
            hostname=args.hostname, port=args.port, close=args.close, verbose=args.verbose))

    args = parser.parse_args()
    args.func(args)



