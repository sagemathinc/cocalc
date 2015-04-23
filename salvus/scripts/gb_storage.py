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
#  - [x] (1:00?) delete old versions of streams
#
# MAYBE:
#  - support 3 tiers of storage: /projects/ssd, /projects/hdd, /projects/ssd-local
#

"""

GS = [G]oogle Cloud Storage / [B]trfs - based project storage system


mkfs.btrfs /dev/sdb
mount -o compress-force=lzo,noatime /dev/sdb /projects
btrfs quota enable /projects/

btrfs subvolume create /projects/sagemathcloud
rsync -LrxvH /home/salvus/salvus/salvus/local_hub_template/ /projects/sagemathcloud/

Worry about tmp, e.g.,

    btrfs su create /projects/tmp
    chmod a+rwx /projects/tmp    # wrong.
    mount -o bind /projects/tmp /tmp/

For dedup support:

    cd /tmp && rm -rf duperemove && git clone https://github.com/markfasheh/duperemove && cd duperemove && sudo make install && rm -rf /tmp/duperemove

"""

# used in naming streams -- changing this would break all existing data...
TO      = "-to-"

# appended to end of snapshot name to make it persistent (never automatically deleted)
PERSIST = "-persist"

UID_WHITELIST = "/root/smc-iptables/uid_whitelist"

import hashlib, json, os, re, shutil, signal, sys, tempfile, time
from subprocess import Popen, PIPE

def log(s, *args):
    if args:
        s = s%args
    sys.stderr.write(str(s)+'\n')
    sys.stderr.flush()

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

def btrfs_subvolume_id(subvolume):
    a = btrfs(['subvolume', 'show', subvolume])
    i = a.find('Object ID:')
    a = a[i:]
    i = a.find('\n')
    return int(a[:i].split(':')[1].strip())

def btrfs_subvolume_usage(subvolume, allow_rescan=True):
    """
    Returns the space used by this subvolume in megabytes.
    """
    # first sync so that the qgroup numbers are correct
    # "To get accurate information, you must issue a sync before using the qgroup show command."
    # from https://btrfs.wiki.kernel.org/index.php/Quota_support#Known_issues
    btrfs(['filesystem', 'sync', subvolume])
    # now get all usage information (no way to restrict)
    a = btrfs(['qgroup', 'show', subvolume])
    # and filter out what we want.
    i = a.find("\n0/%s"%btrfs_subvolume_id(subvolume))
    a = a[i:].strip()
    i = a.find('\n')
    v = a[:i].split()
    usage = float(v[1])/1000000
    # exclusive = float(v[2])/1000000  # not reliable, esp with snapshot deletion.
    if allow_rescan and usage < 0:
        # suspicious!
        btrfs(['quota', 'rescan', subvolume])
        time.sleep(1)
        return btrfs_subvolume_usage(subvolume, allow_rescan=False)
    return usage

def gs_ls_nocache(path):
    i = len(path) + 1
    try:
        return [x[i:].strip('/') for x in sorted(gsutil(['ls', path]).splitlines())]
    except Exception, mesg:
        if 'matched no objects' in str(mesg):
            return []
        else:
            raise

# We cache the recursive listing until gsutil is called again, which is the only likely
# way that the listing would change -- this is a short running script, run once for
# each operation.  Doing "gsutil ls" has major latency (e.g., nearly a second).
gs_ls_cache = {}
def gs_ls(path):
    v = path.split('/')
    project_id = v[3]  # gs://smc-gb-storage-?/project_id/....
    if project_id not in gs_ls_cache:
        # refresh the cache
        try:
            gs_ls_cache[project_id] = gsutil(['ls', '/'.join(v[:4]) + "/**"], verbose=0).splitlines()
        except Exception, mesg:
            if 'matched no objects' in str(mesg):
                gs_ls_cache[project_id] = []
            else:
                raise
    i = len(path) + 1
    r = list(sorted(set([x[i:].split('/')[0] for x in gs_ls_cache[project_id] if x.startswith(path)])))
    log("gs_ls('%s') = %s"%(path, r))
    return r

def gsutil(args, **kwds):
    gs_ls_cache.clear()
    return cmd(['gsutil']+args, **kwds)

class Project(object):
    def __init__(self,
                 project_id,          # v4 uuid string
                 btrfs,               # btrfs filesystem mount
                 bucket        = '',  # google cloud storage bucket (won't use gs/disable close if not given)
                ):
        if len(project_id) != 36:
            raise RuntimeError("invalid project uuid='%s'"%project_id)
        self.btrfs     = btrfs
        if not os.path.exists(self.btrfs):
            raise RuntimeError("mount point %s doesn't exist"%self.btrfs)
        self.project_id    = project_id
        if bucket:
            self.gs_path       = os.path.join('gs://%s'%bucket, project_id, 'v0')
        else:
            self.gs_path   = None
        self.project_path  = os.path.join(self.btrfs, project_id)
        snapshots = os.path.join(self.btrfs, ".snapshots")
        if not os.path.exists(snapshots):
            btrfs(['subvolume', 'create', snapshots])
        self.snapshot_path = os.path.join(snapshots, project_id)
        self.smc_path      = os.path.join(self.project_path, '.sagemathcloud')

        # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
        # user could somehow generate an account id of their choosing, this wouldn't help them get the
        # same uid as another user.
        # 2^31-1=max uid which works with FUSE and node (and Linux, which goes up to 2^32-2).
        n = int(hashlib.sha512(self.project_id).hexdigest()[:8], 16)  # up to 2^32
        n /= 2  # up to 2^31
        self.uid = n if n>65537 else n+65537   # 65534 used by linux for user sync, etc.
        self.username = self.project_id.replace('-','')

    def _log(self, name=""):
        def f(s='', *args):
            log("Project(project_id=%s).%s(...): "%(self.project_id, name) + s, *args)
        return f

    def cmd(self, *args, **kwds):
        log("Project(project_id=%s).cmd(...): ", self.project_id)
        return cmd(*args, **kwds)

    ###
    # Users Management
    ###

    def create_user(self, login_shell='/bin/bash'):
        cmd(['/usr/sbin/groupadd', '-g', self.uid, '-o', self.username], ignore_errors=True)
        cmd(['/usr/sbin/useradd',  '-u', self.uid, '-g', self.uid, '-o', self.username,
                  '-d', self.project_path, '-s', login_shell], ignore_errors=True)

    def delete_user(self):
        cmd(['/usr/sbin/userdel',  self.username], ignore_errors=True)
        cmd(['/usr/sbin/groupdel', self.username], ignore_errors=True)

    def pids(self):
        return [int(x) for x in self.cmd(['pgrep', '-u', self.uid], ignore_errors=True).replace('ERROR','').split()]

    def num_procs(self):
        return len(self.pids())

    def killall(self, grace_s=0.5, max_tries=10):
        log = self._log('killall')
        log("killing all processes by user with id %s"%self.uid)
        # we use both kill and pkill -- pkill seems better in theory, but I've definitely seen it get ignored.
        for i in range(max_tries):
            n = self.num_procs()
            log("kill attempt left %s procs"%n)
            if n == 0:
                return
            self.cmd(['/usr/bin/killall', '-u', self.username], ignore_errors=True)
            self.cmd(['/usr/bin/pkill', '-u', self.uid], ignore_errors=True)
            time.sleep(grace_s)
            self.cmd(['/usr/bin/killall', '-9', '-u', self.username], ignore_errors=True)
            self.cmd(['/usr/bin/pkill', '-9', '-u', self.uid], ignore_errors=True)
        log("WARNING: failed to kill all procs after %s tries"%MAX_TRIES)

    def gs_version(self):
        if not self.gs_path:
            return ''
        try:
            return self._gs_version
        except:
            v = self.snapshot_ls()
            if v:
                # set from local, which we cache since it is what we want to use for any other subsequent ops.
                s = cmd("btrfs subvolume show %s|grep Creation"%os.path.join(self.snapshot_path, v[0]))
                i = s.find(":")
                self._gs_version = s[i+1:].strip().replace(' ','-').replace(':','')  # safe to cache.
                return self._gs_version
            else:
                # set from newest on GCS; don't cache, since could subsequently change, e.g., on save.
                v = gs_ls(self.gs_path)
                return v[-1] if v else ''

    def delete_old_versions(self):
        """
        Delete all old versions of this project from Google cloud storage.
        """
        versions = gs_ls(self.gs_path)
        for path in versions[:-1]:
            p = os.path.join(self.gs_path, path)
            log("Deleting old version %s", p)
            gsutil(['rm', '-R', p])

    def gs_ls(self):
        # list contents of google cloud storage for this project
        if not self.gs_path:
            return []
        return gs_ls(os.path.join(self.gs_path, self.gs_version()))

    def gs_get(self, streams):
        if not self.gs_path:
            raise RuntimeError("can't get since no gs bucket defined")
        targets = []
        sources = []
        tmp_path = tempfile.mkdtemp()
        gs_version = self.gs_version()
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
                    sources.append(os.path.join(self.gs_path, gs_version, stream))
                targets.append(os.path.join(tmp_path, stream))
            if len(sources) == 0:
                return sources
            # Get all the streams we need (in parallel).
            # We parallelize at two levels because just using gsutil -m cp with say 100 or so
            # inputs causes it to HANG every time.  On the other hand, using thread_map for
            # everything quickly uses up all RAM on the computer.  The following is a tradeoff.
            # Also, doing one at a time is ridiculously slow.
            chunk_size = max(15, min(50, len(sources)//5))
            def f(v):
                if len(v) > 0:
                    return gsutil(['-q', '-m', 'cp'] + v +[tmp_path])
            thread_map(f, [sources[chunk_size*i:chunk_size*(i+1)] for i in range(len(sources)//chunk_size + 1)])

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
        gsutil(['rm', '-R', os.path.join(self.gs_path, self.gs_version(), stream)])

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

    def chown(self, path):
        cmd(["chown", "%s:%s"%(self.uid, self.uid), '-R', path])

    def create_snapshot_link(self):
        t = os.path.join(self.project_path, '.snapshots')
        if not os.path.exists(t):
            cmd(["ln", "-s", self.snapshot_path, t])
            os.chown(t, self.uid, self.uid)

    def create_smc_path(self):
        if not os.path.exists(self.smc_path):
            smc_template = os.path.join(self.btrfs, "sagemathcloud")
            if not os.path.exists(smc_template):
                log("WARNING: skipping creating %s since %s doesn't exist"%(self.smc_path, smc_template))
            else:
                btrfs(['subvolume', 'snapshot', smc_template, self.smc_path])
                self.chown(self.smc_path)
                # TODO: need to chown smc_template so user can actually use it.
                # TODO: need a command to *update* smc_path contents


    def disk_quota(self, quota=0):  # quota in megabytes
        if os.path.exists(self.project_path):
            btrfs(['qgroup', 'limit', '%sm'%quota if quota else 'none', self.project_path])

    def compute_quota(self, cores, memory, cpu_shares):
        """
        cores      - number of cores (float)
        memory     - megabytes of RAM (int)
        cpu_shares - determines relative share of cpu (e.g., 256=most users)
        """
        if cores <= 0:
            cfs_quota = -1  # no limit
        else:
            cfs_quota = int(100000*cores)

        self.cmd(["cgcreate", "-g", "memory,cpu:%s"%self.username])
        open("/sys/fs/cgroup/memory/%s/memory.limit_in_bytes"%self.username,'w').write("%sM"%memory)
        open("/sys/fs/cgroup/cpu/%s/cpu.shares"%self.username,'w').write(str(cpu_shares))
        open("/sys/fs/cgroup/cpu/%s/cpu.cfs_quota_us"%self.username,'w').write(str(cfs_quota))

        z = "\n%s  cpu,memory  %s\n"%(self.username, self.username)
        cur = open("/etc/cgrules.conf").read() if os.path.exists("/etc/cgrules.conf") else ''

        if z not in cur:
            open("/etc/cgrules.conf",'a').write(z)
            try:
                pids = self.cmd("ps -o pid -u %s"%self.username, ignore_errors=False).split()[1:]
                self.cmd(["cgclassify"] + pids, ignore_errors=True)
                # ignore cgclassify errors, since processes come and go, etc.
            except:
                pass  # ps returns an error code if there are NO processes at all

    def network(self, ban=False):
        """
        Open or ban outgoing network for user.
        """
        # Change the appropriate iptables firewall rule
        self.cmd(["iptables", "-v", "-I", "OUTPUT", "-m", "owner",
                  "--uid-owner", self.uid, "-j", "DROP" if ban else "ACCEPT"])
        # Rest of this just edits the uid whitelist file so that if/when
        # the system-wide firewall is restarted (e.g. to add/remove entries, at
        # least until I fix it so that that restart isn't required), then
        # this user will have the correct network access state.
        change_whitelist = False
        if not os.path.exists(UID_WHITELIST):
            open(UID_WHITELIST,'w').close()
        whitelisted_users = set([x.strip() for x in open(UID_WHITELIST).readlines()])
        uid = str(self.uid)
        if not ban and uid not in whitelisted_users:
            whitelisted_users.add(uid)
            change_whitelist = True
        elif ban and uid in whitelisted_users:
            whitelisted_users.remove(uid)
            change_whitelist = True
        if change_whitelist:
            open(UID_WHITELIST,'w').write('\n'.join(whitelisted_users)+'\n')

    def cgclassify(self):
        try:
            pids = self.cmd("ps -o pid -u %s"%self.username, ignore_errors=False).split()[1:]
            self.cmd(["cgclassify"] + pids, ignore_errors=True)
            # ignore cgclassify errors, since processes come and go, etc.":
        except:
            # ps returns an error code if there are NO processes at all (a common condition).
            pids = []

    def create_project_path(self):
        btrfs(['subvolume', 'create', self.project_path])
        os.chown(self.project_path, self.uid, self.uid)

    def open(self):
        if os.path.exists(self.project_path):
            log("open: already open -- not doing anything")
            self.create_user()
            return

        # more carefully check uuid validity before actually making the project
        try:
            import uuid # this import takes over 0.1s
            assert uuid.UUID(self.project_id).get_version() == 4
        except (AssertionError, ValueError):
            raise RuntimeError("invalid project uuid")

        if not os.path.exists(self.snapshot_path):
            btrfs(['subvolume', 'create', self.snapshot_path])
            os.chown(self.snapshot_path, self.uid, self.uid)

        if not self.gs_path:
            # no google cloud storage configured, so just
            self.create_project_path()
            self.create_snapshot_link()
            self.create_smc_path()
            self.create_user()
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

        downloaded = self.gs_get(missing_streams)

        # make self.project_path equal the newest snapshot
        v = self.snapshot_ls()
        if len(v) == 0:
            if not os.path.exists(self.project_path):
                self.create_project_path()
        else:
            source = os.path.join(self.snapshot_path, v[-1])
            btrfs(['subvolume', 'snapshot', source, self.project_path])
        os.chown(self.project_path, self.uid, self.uid)
        self.create_snapshot_link()
        self.create_smc_path()
        self.create_user()

    def start(self):
        self.open()
        self.cmd(['su', '-', self.username, '-c', 'cd .sagemathcloud; . sagemathcloud-env; ./start_smc'], timeout=30)

    def stop(self):
        self.killall()
        self.delete_user()

    def btrfs_status(self):
        return btrfs_subvolume_usage(self.project_path)

    def status(self, running=False, stop_on_error=True):
        log = self._log("status")
        if running:
            s = {}
        else:
            s = {'username':self.username, 'uid':self.uid}
            s['load'] = [float(a.strip(',')) for a in os.popen('uptime').read().split()[-3:]]

        if not os.path.exists(self.project_path):
            s['status'] = 'closed'
            return s

        if self.username not in open('/etc/passwd').read():  # TODO: can be done better
            s['status'] = 'stopped'
            return s

        s['btrfs'] = self.btrfs_status()
        try:
            t = self.cmd(['su', '-', self.username, '-c', 'cd .sagemathcloud; . sagemathcloud-env; ./status'], timeout=30)
            t = json.loads(t)
            s.update(t)
            if bool(t.get('local_hub.pid',False)):
                s['status'] = 'running'
            else:
                s['status'] = 'opened'
            return s
        except Exception, msg:
            log("Error getting status -- %s"%msg)
            # Original comment: important to actually let error propogate so that bup_server gets an error and knows things are
            # messed up, namely there is a user created, but the status command isn't working at all.  In this
            # case bup_server will know to try to kill this.
            if stop_on_error:
                # ** Actually, in practice sometimes the caller doesn't know
                # to kill this project.   So we explicitly toss in a stop below,
                # which will clean things up completely. **
                self.stop()
                return self.status(running=running, stop_on_error=False)  # try again
            else:
                raise

    def delete_old_snapshots(self, max_snapshots):
        v = self.snapshot_ls()
        if len(v) <= max_snapshots:
            # nothing to do
            return

        # Really stupid algorithm for now:
        #   - keep all persistent snapshots
        #   - take all max_snapshots/2 newest snapshots
        #   - take equally spaced remaining max_snapshots/2 snapshots
        # Note that the code below might leave a few extra snapshots.
        # Maybe https://pypi.python.org/pypi/btrfs-sxbackup/0.5.4 has
        # some better ideas!
        if max_snapshots == 0:
            delete = [s for s in v if not s.endswith(PERSIST)]
        else:
            n = max(1, max_snapshots//2)
            keep = v[-n:]
            s = max(1, len(v)//2 // n)
            i = 0
            while i < len(v)-n:
                keep.append(v[i])
                i += s
            # keep persistent snapshots
            for s in v:
                if s.endswith(PERSIST):
                    keep.append(s)
            keep = list(sorted(set(keep)))
            log("keeping these snapshots: %s", keep)
            delete = list(sorted(set(v).difference(keep)))
            log("deleting these snapshots: %s", delete)

        for snapshot in delete:
            btrfs(['subvolume', 'delete', os.path.join(self.snapshot_path, snapshot)])

    def gs_sync(self):
        if not self.gs_path:
            raise RuntimeError("can't remove since no gs bucket defined")
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

    def save(self, timestamp="", persist=False, max_snapshots=0, dedup=False):
        """
        - persist =  make snapshot that we never automatically delete
        - timestamp = make snapshot with that time
        - max_snapshot - trim old snapshots
        - dedup = run dedup before making the snapshot (dedup potentially saves a *lot* of space in size of stored files, but could take an hour!)
        """
        if not timestamp:
            timestamp = time.strftime("%Y-%m-%d-%H%M%S")
        # figure out what to call the snapshot
        target = os.path.join(self.snapshot_path, timestamp)
        if persist:
            target += PERSIST
        log('creating snapshot %s', target)
        # dedup first
        if dedup:
            self.dedup()
        # create the snapshot
        btrfs(['subvolume', 'snapshot', '-r', self.project_path, target])
        if max_snapshots:
            self.delete_old_snapshots(max_snapshots)
        if self.gs_path:
            self.gs_sync()
        # safe since we successfully saved project
        self.delete_old_versions()

    def delete_snapshot(self, snapshot):
        target = os.path.join(self.snapshot_path, snapshot)
        btrfs(['subvolume', 'delete', target])
        # sync with gs
        if self.gs_path:
            self.gs_sync()

    def close(self, force=False, nosave=False):
        if not force and not self.gs_path:
            raise RuntimeError("refusing to close since you do not have google cloud storage configured, and project would just get deleted")
        # save and upload a snapshot first?
        if not nosave:
            self.save()
        # kill all processes by user, since they may lock removing subvolumes
        self.killall()
        # delete unix user -- no longer needed
        self.delete_user()
        # remove quota, since certain operations below may fail at quota
        self.disk_quota(0)
        # delete snapshot subvolumes
        for x in self.snapshot_ls():
            btrfs(['subvolume', 'delete', os.path.join(self.snapshot_path, x)])
        # delete subvolume that contains all the snapshots
        if os.path.exists(self.snapshot_path):
            btrfs(['subvolume','delete', self.snapshot_path])
        # delete the ~/.sagemathcloud subvolume
        if os.path.exists(self.smc_path):
            btrfs(['subvolume','delete', self.smc_path])
        # delete the project path volume
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

    def dedup(self, verbose=False):
        """
        Deduplicate the live filesystem.

        Uses https://github.com/markfasheh/duperemove
        """
        # we use os.system, since the output is very verbose...
        c = "duperemove -h -d -r '%s'/* "%self.project_path
        if not verbose:
            c += "| tail -10"
        log(c)
        t0 = time.time()
        os.system(c)
        log("finished dedup (%s seconds)", time.time()-t0)

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

    def directory_listing(self, path, hidden=True, time=True, start=0, limit=-1):
        """
        Return in JSON-format, listing of files in the given path.

        - path = relative path in project; *must* resolve to be under PROJECTS_PATH/project_id or get an error.
        """
        project_path = self.project_path
        abspath = os.path.abspath(os.path.join(project_path, path))
        if not abspath.startswith(project_path):
            raise RuntimeError("path (=%s) must be contained in project path %s"%(path, project_path))
        def get_file_mtime(name):
            try:
                # use lstat instead of stat or getmtime so this works on broken symlinks!
                return int(round(os.lstat(os.path.join(abspath, name)).st_mtime))
            except:
                # ?? This should never happen, but maybe if race condition. ??
                return 0

        def get_file_size(name):
            try:
                # same as above; use instead of os.path....
                return os.lstat(os.path.join(abspath, name)).st_size
            except:
                return -1


        listdir = os.listdir(abspath)
        result = {}
        if not hidden:
            listdir = [x for x in listdir if not x.startswith('.')]

        # Get list of (name, timestamp) pairs
        all = [(name, get_file_mtime(name)) for name in listdir]

        if time:
            # sort by time first with bigger times first, then by filename in normal order
            def f(a,b):
                if a[1] > b[1]:
                    return -1
                elif a[1] < b[1]:
                    return 0
                else:
                    return cmp(a[0], b[0])
            all.sort(f)
        else:
            all.sort()  # usual sort is fine

        # Limit and convert to objects
        all = all[start:]
        if limit > 0 and len(all) > limit:
            result['more'] = True
            all = all[:limit]

        files = dict([(name, {'name':name, 'mtime':mtime}) for name, mtime in all])
        sorted_names = [x[0] for x in all]

        # Fill in other OS information about each file
        #for obj in result:
        for name, info in files.iteritems():
            if os.path.isdir(os.path.join(abspath, name)):
                info['isdir'] = True
            else:
                info['size'] = get_file_size(name)

        result['files'] = [files[name] for name in sorted_names]
        return result


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
                self.open()
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
        for k in ['project_id', 'btrfs', 'bucket']:
            if hasattr(args, k):
                kwds[k] = getattr(args, k)
        return Project(**kwds)

    # This is a generic parser for all subcommands that operate on a collection of projects.
    # It's ugly, but it massively reduces the amount of code.
    def f(subparser, function):
        def g(args):
            special = [k for k in args.__dict__.keys() if k not in ['project_id', 'btrfs', 'bucket', 'func']]
            out = []
            for project_id in args.project_id:
                kwds = dict([(k,getattr(args, k)) for k in special])
                out.append(getattr(Project(project_id=project_id, btrfs=args.btrfs, bucket=args.bucket), function)(**kwds))
            if len(out) == 1:
                print json.dumps(out[0])
            else:
                print json.dumps(out)
        subparser.add_argument("project_id", help="UUID of project", type=str, nargs="+")
        subparser.set_defaults(func=g)

    # optional arguments to all subcommands
    parser.add_argument("--btrfs", help="BTRFS mountpoint [default: /projects or $SMC_BTRFS if set]",
                        dest="btrfs", default=os.environ.get("SMC_BTRFS","/projects"), type=str)
    parser.add_argument("--bucket",
                        help="Google Cloud storage bucket [default: $SMC_BUCKET or ''=do not use google cloud storage]",
                        dest='bucket', default=os.environ.get("SMC_BUCKET",""), type=str)

    # open a project
    f(subparsers.add_parser('open', help='Open project'), 'open')

    # start project running
    f(subparsers.add_parser('start', help='Start project running (open and start daemon)'), 'start')

    parser_status = subparsers.add_parser('status', help='get status of servers running in the project')
    parser_status.add_argument("--running", help="if given only return running part of status (easier to compute)",
                                   dest="running", default=False, action="store_const", const=True)
    f(parser_status, 'status')

    # disk quota
    parser_disk_quota = subparsers.add_parser('disk_quota', help='set the disk quota')
    parser_disk_quota.add_argument("disk_quota", help="disk_quota in MB (or 0 for no disk_quota).", type=int)
    f(parser_disk_quota, 'disk_quota')

    # compute quota
    parser_compute_quota = subparsers.add_parser('compute_quota', help='Set the compute quotas')
    parser_compute_quota.add_argument("--cores", help="number of cores (default: 1) float", type=float, default=1)
    parser_compute_quota.add_argument("--memory", help="megabytes of RAM (default: 1000) int", type=int, default=1)
    parser_compute_quota.add_argument("--cpu_shares", help="relative share of cpu (default: 256) int", type=int, default=256)
    f(parser_compute_quota, 'compute_quota')

    parser_network = subparsers.add_parser('network', help='allow or ban network access for this user')
    parser_network.add_argument("--ban", help="if given ban access to network (otherwise grant access)",
                                   dest="ban", default=False, action="store_const", const=True)
    f(parser_network, 'network')

    # create UNIX user for project
    parser_create_user = subparsers.add_parser('create_user', help='Create the user')
    parser_create_user.add_argument("--login_shell", help="", type=str, default='/bin/bash')
    f(parser_create_user, 'create_user')

    # delete UNIX user for project
    parser_delete_user = subparsers.add_parser('delete_user', help='Delete the user')
    f(parser_delete_user, 'delete_user')

    # kill all processes by UNIX user for project
    parser_killall = subparsers.add_parser('killall', help='Kill all processes by this user')
    f(parser_killall, 'killall')

    # kill all processes and delete unix user.
    parser_stop = subparsers.add_parser('stop', help='Kill all processes and delete user')
    f(parser_stop, 'stop')

    # close project -- deletes all local files
    parser_close = subparsers.add_parser('close',
                     help='Close this project removing all files from this local host (does *NOT* save first)')
    parser_close.add_argument("--force",
                              help="force close even if GCS not configured (so project lost)",
                              default=False, action="store_const", const=True)
    parser_close.add_argument("--nosave",
                              help="do not save a snapshot before close (will loose all data since last save)",
                              default=False, action="store_const", const=True)
    f(parser_close, 'close')

    # destroy project -- delete local files **and** files in Google cloud storage.
    parser_destroy = subparsers.add_parser('destroy',
                     help='Completely destroy this project **EVERYWHERE** (including cloud storage)')
    f(parser_destroy, 'destroy')

    # save project
    parser_save = subparsers.add_parser('save', help='snapshot project, delete old snapshots, sync with GCS')
    parser_save.add_argument("--max_snapshots", help="maximum number of snapshots (if given may delete some snapshots)", default=0, type=int)
    parser_save.add_argument("--timestamp", help="optional timestamp in the form %Y-%m-%d-%H%M%S", default="", type=str)
    parser_save.add_argument("--persist", help="if given, won't automatically delete",
                             default=False, action="store_const", const=True)
    parser_save.add_argument("--dedup", help="run dedup before making the snapshot -- can take a LONG time, but saves a lot on snapshots stored in GCS",
                             default=False, action="store_const", const=True)
    f(parser_save, 'save')

    # delete old snapshots in project
    parser_delete_old_snapshots = subparsers.add_parser('delete_old_snapshots', help='')
    parser_delete_old_snapshots.add_argument("max_snapshots", help="maximum number of snapshots", type=int)
    f(parser_delete_old_snapshots, 'delete_old_snapshots')

    # sync project with GCS.
    parser_sync = subparsers.add_parser('sync', help='sync project with GCS, without first saving a new snapshot')
    f(parser_sync, 'gs_sync')

    # delete a particular snapshot
    parser_delete_snapshot = subparsers.add_parser('delete_snapshot', help='delete a particular snapshot')
    parser_delete_snapshot.add_argument("snapshot", help="snapshot to delete", type=str)
    f(parser_delete_snapshot, 'delete_snapshot')

    # delete the older versions of project from GCS, which get left in case
    # project is opened on a new machine, where the btrfs uuid's are different.
    f(subparsers.add_parser('delete_old_versions',
                            help='Delete all old versions from Google cloud storage'), 'delete_old_versions')

    # dedup contents of project -- might save disk space
    parser_dedup = subparsers.add_parser('dedup',
                            help='dedup live project (WARNING: could take a long time)')
    parser_dedup.add_argument("--verbose", default=False, action="store_const", const=True)
    f(parser_dedup, 'dedup')

    # directory listing
    parser_directory_listing = subparsers.add_parser('directory_listing', help='list files (and info about them) in a directory in the project')
    parser_directory_listing.add_argument("--path", help="relative path in project", dest="path", default='', type=str)
    parser_directory_listing.add_argument("--hidden", help="if given, show hidden files",
                                   dest="hidden", default=False, action="store_const", const=True)
    parser_directory_listing.add_argument("--time", help="if given, sort by time with newest first",
                                   dest="time", default=False, action="store_const", const=True)
    parser_directory_listing.add_argument("--start", help="return only part of listing starting with this position (default: 0)",
                                   dest="start", default=0, type=int)
    parser_directory_listing.add_argument("--limit", help="if given, only return this many directory entries (default: -1)",
                                   dest="limit", default=-1, type=int)

    f(parser_directory_listing, 'directory_listing')

    args = parser.parse_args()
    args.func(args)



