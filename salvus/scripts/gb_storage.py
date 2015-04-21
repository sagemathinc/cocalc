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
#  - [ ] (3:00?) carry over all functionality *needed* from bup_storage.py
#  - [ ] (1:00?) delete excessive snapshots: ???
#  - [ ] (1:00?) delete old versions of streams
#
# MAYBE:
#  - support 3 tiers of storage: /projects/ssd, /projects/hdd, /projects/ssd-local
#

"""

GS = [G]oogle Cloud Storage / [B]trfs - based project storage system

mkfs.btrfs /dev/sdb
mount -o compress=lzo /dev/sdb /projects
btrfs subvolume create /projects/sagemathcloud
rsync -LrxvH /home/salvus/salvus/salvus/local_hub_template/ /projects/sagemathcloud/

Worry about tmp, e.g.,

    btrfs su create /projects/tmp
    chmod a+rwx /projects/tmp    # wrong.
    mount -o bind /projects/tmp /tmp/

"""

# used in naming streams -- changing this would break all existing data...
TO           = "-to-"

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

def gsutil(args, **kwds):
    return cmd(['gsutil']+args, **kwds)

class Project(object):
    def __init__(self,
                 project_id,                  # v4 uuid string
                 btrfs_mnt     = '/projects', # btrfs filesystem mount
                 bucket        = '',          # google cloud storage bucket (won't use gs/disable close if not given)
                 quota         = 0,           # MB btrfs disk quota to impose on project
                 max_snapshots = 0            # maximum number of snapshots to keep
                ):
        try:
            u = uuid.UUID(project_id)
            assert u.get_version() == 4
            project_id = str(u)  # leaving off dashes still makes a valid uuid in python
        except (AssertionError, ValueError):
            raise RuntimeError("invalid project uuid='%s'"%project_id)
        self.btrfs_mnt     = btrfs_mnt
        if not os.path.exists(self.btrfs_mnt):
            raise RuntimeError("mount point %s doesn't exist"%self.btrfs_mnt)
        self.project_id    = project_id
        self.quota         = quota
        self.max_snapshots = max_snapshots
        if bucket:
            self.gs_path       = os.path.join('gs://%s'%bucket, project_id, 'v0')
        else:
            self.gs_path   = None
        self.project_path  = os.path.join(self.btrfs_mnt, project_id)
        snapshots = os.path.join(self.btrfs_mnt, ".snapshots")
        if not os.path.exists(snapshots):
            btrfs(['subvolume', 'create', snapshots])
        self.snapshot_path = os.path.join(snapshots, project_id)
        self.smc_path      = os.path.join(self.project_path, '.sagemathcloud')


    def gs_version(self):
        if not self.gs_path:
            return ''
        try:
            return self._gs_version
        except:
            v = self.snapshot_ls()
            if len(v) == 0:
                # set from newest on GCS
                i = len(self.gs_path) + 1
                a = [x[i:] for x in sorted(gsutil(['ls', self.gs_path]).splitlines())]
                return a[-1].strip('/')  # do *NOT* cache -- not safe to do so.
            else:
                s = cmd("btrfs subvolume show %s|grep Creation"%os.path.join(self.snapshot_path, v[0]))
                i = s.find(":")
                self._gs_version = s[i+1:].strip().replace(' ','-').replace(':','')  # safe to cache.
            return self._gs_version

    def gs_ls(self):
        if not self.gs_path:
            return []
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
        if not self.gs_path:
            raise RuntimeError("can't get since no gs bucket defined")
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
        if not self.gs_path:
            raise RuntimeError("can't remove since no gs bucket defined")
        gsutil(['rm', os.path.join(self.gs_path, self.gs_version(), stream)])

    def gs_put(self, stream):
        if not self.gs_path:
            raise RuntimeError("can't put since no gs bucket defined")
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

    def create_smc_path(self):
        if not os.path.exists(self.smc_path):
            smc_template = os.path.join(self.btrfs_mnt, "sagemathcloud")
            if not os.path.exists(smc_template):
                log("WARNING: skipping creating %s since %s doesn't exist"%(self.smc_path, smc_template))
            else:
                btrfs(['subvolume', 'snapshot', smc_template, self.smc_path])
                # TODO: need to chown smc_template so user can actually use it.
                # TODO: need a command to *update* smc_path contents

    def open(self, allow_broken=False):
        # allow_broken is due only to bugs during initial migration--delete after fix

        if os.path.exists(self.project_path):
            log("open: already open -- not doing anything")
            return

        if not os.path.exists(self.snapshot_path):
            btrfs(['subvolume', 'create', self.snapshot_path])

        if not self.gs_path:
            # no google cloud storage configured, so just
            btrfs(['subvolume', 'create', self.project_path])
            self.create_snapshot_link()
            self.create_smc_path()
            return

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

        try:
            downloaded = self.gs_get(missing_streams)
        except RuntimeError, mesg:
            if not allow_broken:
                raise
            else:
                log("WARNING: some streams failed! -- %s"%mesg)

        # make self.project_path equal the newest snapshot
        v = self.snapshot_ls()
        if len(v) == 0:
            if not os.path.exists(self.project_path):
                btrfs(['subvolume', 'create', self.project_path])
        else:
            source = os.path.join(self.snapshot_path, v[-1])
            btrfs(['subvolume', 'snapshot', source, self.project_path])

        self.create_snapshot_link()
        self.create_smc_path()

        # TODO: right now this spends a lot of time uploading everything back using the
        # new btrfs uuid's.
        # But be careful fixing this!  Fix may be just be to remove, but carefully test by
        # open/change/save/close/open/etc.!
        self.gs_sync()

    def delete_old_snapshots(self):
        #TODO
        return

    def gs_sync(self):
        if not self.gs_path:
            raise RuntimeError("can't remove since no gs bucket defined")
        cmd("sync")
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
        if self.gs_path:
            self.gs_sync()

    def delete_snapshot(self, snapshot):
        target = os.path.join(self.snapshot_path, snapshot)
        btrfs(['subvolume', 'delete', target])
        # sync with gs
        if self.gs_path:
            self.gs_sync()

    def close(self, force=False):
        if not force and not self.gs_path:
            raise RuntimeError("refusing to close since you do not have google cloud storage configured, and project would just get deleted")
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

    def _exclude(self, prefix, prog='rsync'):
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
            if not os.path.exists(self.project_path):
                # for migrate, definitely only open if not already open
                self.open(allow_broken=True)
            if ':' in hostname:
                remote = hostname
            else:
                remote = "%s:/projects/%s"%(hostname, self.project_id)
            s = "rsync -%szaxH --max-size=50G --delete-excluded --delete --ignore-errors %s -e 'ssh -o StrictHostKeyChecking=no -p %s' %s/ %s/ </dev/null"%('v' if verbose else '', ' '.join(self._exclude('')), port, remote, self.project_path)
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
    parser = argparse.ArgumentParser(description="GS = [G]oogle Cloud Storage / [B]trfs - based project storage system")
    subparsers = parser.add_subparsers(help='sub-command help')

    def project(args):
        kwds = {}
        for k in ['quota', 'project_id', 'btrfs', 'bucket', 'max_snapshots']:
            if hasattr(args, k):
                if k == 'btrfs':
                    kwds['btrfs_mnt'] = getattr(args, k)
                else:
                    kwds[k] = getattr(args, k)
        return Project(**kwds)

    parser.add_argument("--btrfs", help="BTRFS mountpoint [default: /projects]",
                        dest="btrfs", default="/projects", type=str)
    parser.add_argument("--bucket", help="Google Cloud storage bucket [default: ''=do not use google]",
                        dest='bucket', default='', type=str)

    parser_open = subparsers.add_parser('open', help='')
    parser_open.add_argument("--quota", help="quota in MB", default=0, type=int)
    parser_open.add_argument("project_id", help="", type=str)
    parser_open.set_defaults(func=lambda args: project(args).open())

    parser_close = subparsers.add_parser('close', help='')
    parser_close.add_argument("--max", help="maximum number of snapshots", dest="max", default=0, type=int)
    parser_close.add_argument("--force", help="force close even if google cloud storage not configured (so project lost)",
                             default=False, action="store_const", const=True)
    parser_close.add_argument("project_id", help="close this project removing all files from this local host (does NOT save first)", type=str)
    parser_close.set_defaults(func=lambda args: project(args).close(force=args.force))

    parser_destroy = subparsers.add_parser('destroy', help='')
    parser_destroy.add_argument("project_id", help="completely destroy this project **EVERYWHERE** -- can't be undone", type=str)
    parser_destroy.set_defaults(func=lambda args: project(args).destroy())

    parser_save = subparsers.add_parser('save', help='')
    parser_save.add_argument("--max", help="maximum number of snapshots", default=0, type=int)
    parser_save.add_argument("--timestamp", help="optional timestamp in the form %Y-%m-%d-%H%M%S", default="", type=str)
    parser_save.add_argument("--persist", help="if given, won't automatically delete",
                             default=False, action="store_const", const=True)
    parser_save.add_argument("project_id", help="", type=str)
    parser_save.set_defaults(func=lambda args: project().save(timestamp=args.timestamp, persist=args.persist))

    parser_sync = subparsers.add_parser('sync', help='')
    parser_sync.add_argument("project_id", help="sync project with GCS, without first saving a new snapshot", type=str)
    parser_sync.set_defaults(func=lambda args: project(args).gs_sync())

    parser_delete_snapshot = subparsers.add_parser('delete_snapshot', help='delete a particular snapshot')
    parser_delete_snapshot.add_argument("snapshot", help="snapshot to delete", type=str)
    parser_delete_snapshot.add_argument("project_id", help="", type=str)
    parser_delete_snapshot.set_defaults(func=lambda args: project(args).delete_snapshot(args.snapshot))

    parser_deduplicate = subparsers.add_parser('deduplicate', help='deduplicate live project (WARNING: could take hours!)')
    parser_deduplicate.add_argument("project_id", help="", type=str)
    parser_deduplicate.set_defaults(func=lambda args: project(args).deduplicate())

    parser_migrate = subparsers.add_parser('migrate', help='migrate project to new format')
    parser_migrate.add_argument("--source", help="path to directory of project_id.tar bup repos or 'gsutil'", default="gsutil", type=str)
    parser_migrate.add_argument("project_id", help="", type=str)
    parser_migrate.set_defaults(func=lambda args: project(args).migrate(source=args.source))

    parser_migrate_live = subparsers.add_parser('migrate_live', help='')
    parser_migrate_live.add_argument("--port", help="path to directory of project_id.tar bup repos or 'gsutil'", default=22, type=int)
    parser_migrate_live.add_argument("--verbose", default=False, action="store_const", const=True)
    parser_migrate_live.add_argument("--close", help="if given, close project after updating (default: DON'T CLOSE)",
                                     default=False, action="store_const", const=True)
    parser_migrate_live.add_argument("hostname", help="hostname[:path]", type=str)
    parser_migrate_live.add_argument("project_id", help="", type=str)
    parser_migrate_live.set_defaults(func=lambda args: project(args).migrate_live(
            hostname=args.hostname, port=args.port, close=args.close, verbose=args.verbose))

    args = parser.parse_args()
    args.func(args)



