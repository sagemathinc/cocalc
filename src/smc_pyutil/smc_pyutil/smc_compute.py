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


# used in naming streams -- changing this would break all existing data...
TO      = "-to-"

# appended to end of snapshot name to make it persistent (never automatically deleted)
PERSIST = "-persist"

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"

# This is the quota for the .smc directory; must be
# significantly bigger than that directory, and hold user logs.
SMC_TEMPLATE_QUOTA = '1000m'

USER_SWAP_MB = 1000  # amount of swap users get

import hashlib, json, math, os, platform, re, shutil, signal, socket, stat, sys, tempfile, time
from subprocess import Popen, PIPE

PLATFORM = platform.system().lower()

def quota_to_int(x):
    return int(math.ceil(x))

def log(s, *args):
    if args:
        try:
            s = str(s%args)
        except Exception, mesg:
            s = str(mesg) + str(s)
    sys.stderr.write(s+'\n')
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

def check_uuid(u):
    try:
        import uuid # this import takes over 0.1s
        assert uuid.UUID(u).get_version() == 4
    except (AssertionError, ValueError), mesg:
        raise RuntimeError("invalid uuid (='%s')"%u)


def uid(project_id):
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    # 2^31-1=max uid which works with FUSE and node (and Linux, which goes up to 2^32-2).
    n = int(hashlib.sha512(project_id).hexdigest()[:8], 16)  # up to 2^32
    n /= 2  # up to 2^31
    return n if n>65537 else n+65537   # 65534 used by linux for user sync, etc.


def thread_map(callable, inputs):
    """
    Computing [callable(args) for args in inputs]
    in parallel using len(inputs) separate *threads*.

    If an exception is raised by any thread, a RuntimeError exception
    is instead raised.
    """
    log("Doing the following in parallel:\n%s", '\n'.join([str(x) for x in inputs]))
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
    return cmd(['/sbin/btrfs']+args, **kwds)

def btrfs_subvolume_id(subvolume):
    a = btrfs(['subvolume', 'show', subvolume], verbose=0)
    i = a.find('Object ID:')
    a = a[i:]
    i = a.find('\n')
    return int(a[:i].split(':')[1].strip())

def btrfs_subvolume_usage(subvolume, allow_rescan=True):
    """
    Returns the space used by this subvolume in megabytes.
    """
    return 0 # no longer available
    # first sync so that the qgroup numbers are correct
    # "To get accurate information, you must issue a sync before using the qgroup show command."
    # from https://btrfs.wiki.kernel.org/index.php/Quota_support#Known_issues
    # COMMENTED OUT -- doing a lot of these at once leads to massive deadlock... maybe use a different approach...
    #btrfs(['filesystem', 'sync', subvolume])
    # now get all usage information (no way to restrict)
    a = btrfs(['qgroup', 'show', subvolume], verbose=0)
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
    key = project_id+v[2]
    if key not in gs_ls_cache:
        # refresh the cache
        try:
            gs_ls_cache[key] = gsutil(['ls', '/'.join(v[:4]) + "/**"], verbose=0).splitlines()
        except Exception, mesg:
            if 'matched no objects' in str(mesg):
                gs_ls_cache[key] = []
            else:
                raise
    i = len(path) + 1
    r = list(sorted(set([x[i:].split('/')[0] for x in gs_ls_cache[key] if x.startswith(path)])))
    log("gs_ls('%s') = %s"%(path, r))
    return r

def gsutil(args, **kwds):
    gs_ls_cache.clear()
    return cmd(['gsutil']+args, **kwds)

class Project(object):
    def __init__(self,
                 project_id,          # v4 uuid string
                 btrfs,               # btrfs filesystem mount
                 bucket        = '',  # google cloud storage bucket (won't use gs/disable close if not given); start with gs://
                 archive       = '',  # if given path in filesystem or google cloud storage bucket destination for incremental tar archives.
                 storage       = '',
                 dev           = False,  # if true, use special devel mode where everything run as same user (no sudo needed); totally insecure!
                ):
        self._dev = dev

        if len(project_id) != 36:
            raise RuntimeError("invalid project uuid='%s'"%project_id)
        self.btrfs = btrfs
        if not os.path.exists(self.btrfs):
            if self._dev:
                os.makedirs(self.btrfs)
            else:
                raise RuntimeError("mount point %s doesn't exist"%self.btrfs)
        self.project_id    = project_id
        if bucket:
            self.gs_path   = os.path.join(bucket, project_id, 'v0')
        else:
            self.gs_path   = None
        self._archive  = archive
        self.project_path  = os.path.join(self.btrfs, project_id)
        self.snapshot_path = os.path.join(self.btrfs, ".snapshots", project_id)
        self.opened_path   = os.path.join(self.snapshot_path, '.opened')
        self.snapshot_link = os.path.join(self.project_path, '.snapshots')
        self.smc_path      = os.path.join(self.project_path, '.smc')
        self.forever_path  = os.path.join(self.project_path, '.forever')
        self.uid           = uid(self.project_id)
        self.username      = self.project_id.replace('-','')
        self.storage       = storage
        self.open_fail_file = os.path.join(self.project_path, '.sagemathcloud-open-failed')

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
        if self._dev:
            return
        cmd(['/usr/sbin/groupadd', '-g', self.uid, '-o', self.username], ignore_errors=True)
        cmd(['/usr/sbin/useradd',  '-u', self.uid, '-g', self.uid, '-o', self.username,
                  '-d', self.project_path, '-s', login_shell], ignore_errors=True)

    def delete_user(self):
        if self._dev:
            return
        cmd(['/usr/sbin/userdel',  self.username], ignore_errors=True)
        cmd(['/usr/sbin/groupdel', self.username], ignore_errors=True)
        if os.path.exists('/etc/cgrules.conf'):
            c = open("/etc/cgrules.conf").read()
            i = c.find(self.username)
            if i != -1:
                j = c[i:].find('\n')
                if j == -1:
                    j = len(c)
                else:
                    j += i
                open("/etc/cgrules.conf",'w').write(c[:i]+c[j+1:])

    def pids(self):
        return [int(x) for x in self.cmd(['pgrep', '-u', self.uid], ignore_errors=True).replace('ERROR','').split()]

    def num_procs(self):
        return len(self.pids())

    def killall(self, grace_s=0.5, max_tries=10):
        log = self._log('killall')
        if self._dev:
            self.dev_env()
            os.chdir(self.project_path)
            self.cmd("smc-local-hub stop")
            self.cmd("smc-console-server stop")
            self.cmd("smc-sage-server stop")
            return

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
                if os.path.exists(self.opened_path):
                    self._gs_version = open(self.opened_path).read()
                else:
                    v = time.strftime(TIMESTAMP_FORMAT)
                    open(self.opened_path, 'w').write(v)
                    self._gs_version = v
                return self._gs_version
            else:
                # set from newest on GCS; don't cache, since could subsequently change, e.g., on save.
                v = gs_ls(self.gs_path)
                return v[-1] if v else ''

    def delete_old_versions(self):
        """
        Delete all old versions of this project from Google cloud storage.
        """
        if not self.gs_path:
            # not using cloud storage
            return
        versions = gs_ls(self.gs_path)
        for path in versions[:-1]:
            p = os.path.join(self.gs_path, path)
            log("Deleting old version %s", p)
            try:
                gsutil(['rm', '-R', p])
            except Exception, mesg:
                # non-fatal since it isn't really necessary and/or will just happen later
                log("WARNING: problem deleting old version %s -- %s ", p, mesg)

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

            gsutil(['-o', 'GSUtil:parallel_composite_upload_threshold=150M', '-q', '-m', 'cp', target, os.path.join(self.gs_path, self.gs_version(), stream)])
        finally:
            shutil.rmtree(tmp_path)

    def snapshot_ls(self):
        if not os.path.exists(self.snapshot_path):
            return []
        else:
            v = list(sorted(cmd(['ls', self.snapshot_path], verbose=1).splitlines()))
            # workaround a hopefully temporary bug.
            w = []
            n = len('2015-05-03-081013')
            for s in v:
                try:
                    time.strptime(s[:n], TIMESTAMP_FORMAT)
                    w.append(s)
                except:
                    try:
                        os.unlink(os.path.join(self.snapshot_path, s))
                    except:
                        pass
                    pass
            return w

    def chown(self, path):
        if self._dev:
            return
        cmd(["chown", "%s:%s"%(self.uid, self.uid), '-R', path])

    def ensure_file_exists(self, src, target):
        target = os.path.abspath(target)
        if not os.path.exists(target):
            self.makedirs(os.path.split(target)[0])
            shutil.copyfile(src, target)
            if USERNAME == "root":
                os.chown(target, self.uid, self.uid)

    def create_snapshot_link(self):
        if self.storage: return  # TODO
        snapshots = os.path.join(self.btrfs, ".snapshots")
        self.create_snapshot_path()
        if os.path.exists(self.snapshot_link):
            return
        self.remove_snapshot_link()
        t = self.snapshot_link
        try:
            os.unlink(t)
        except:
            try:
                shutil.rmtree(t)
            except:
                pass
        try:
            cmd(["ln", "-s", self.snapshot_path, t])
        except Exception, mesg:
            if "ile exists" in str(mesg):
                log("WARNING: race creating snapshot link -- %s", mesg)
            else:
                raise

    def remove_snapshot_link(self):
        if self._dev:
            return
        t = self.snapshot_link
        try:
            os.unlink(t)
        except:
            try:
                shutil.rmtree(t)
            except:
                pass

    def create_smc_path(self):
        if not os.path.exists(self.smc_path):
            os.makedirs(self.smc_path)
        self.chown(self.smc_path)
        self.ensure_conf_files_exist()

    def ensure_conf_files_exist(self):
        for filename in ['bashrc', 'bash_profile']:
            target = os.path.join(self.project_path, '.' + filename)
            if not os.path.exists(target):
                source = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'templates', PLATFORM, filename)
                if os.path.exists(source):
                    shutil.copyfile(source, target)
                    if not self._dev:
                        os.chown(target, self.uid, self.uid)

    def remove_forever_path(self):
        if os.path.exists(self.forever_path):
            shutil.rmtree(self.forever_path, ignore_errors=True)

    def remove_smc_path(self):
        # do our best to remove the smc path
        self.delete_subvolume(self.smc_path)
        if os.path.exists(self.smc_path):
            shutil.rmtree(self.smc_path, ignore_errors=True)

    def disk_quota(self, quota=0):  # quota in megabytes
        try:
            quota = quota_to_int(quota)
            # requires quotas to be setup as explained nicely at
            # https://www.digitalocean.com/community/tutorials/how-to-enable-user-and-group-quotas
            # and https://askubuntu.com/questions/109585/quota-format-not-supported-in-kernel/165298#165298
            # This sets the quota on all mounted filesystems:
            cmd(['setquota', '-u', self.username, quota*1000, quota*1200, 1000000, 1100000, '-a'])
            #btrfs(['qgroup', 'limit', '%sm'%quota if quota else 'none', self.project_path])
        except Exception, mesg:
            log("WARNING -- quota failure %s", mesg)

    def compute_quota(self, cores, memory, cpu_shares):
        """
        cores      - number of cores (float)
        memory     - megabytes of RAM (int)
        cpu_shares - determines relative share of cpu (e.g., 256=most users)
        """
        if self._dev:
            return
        cfs_quota = int(100000*cores)

        group = "memory,cpu:%s"%self.username
        self.cmd(["cgcreate", "-g", group])
        if memory:
            memory = quota_to_int(memory)
            open("/sys/fs/cgroup/memory/%s/memory.limit_in_bytes"%self.username,'w').write("%sM"%memory)
            open("/sys/fs/cgroup/memory/%s/memory.memsw.limit_in_bytes"%self.username,'w').write("%sM"%(USER_SWAP_MB + memory))
        if cpu_shares:
            cpu_shares = quota_to_int(cpu_shares)
            open("/sys/fs/cgroup/cpu/%s/cpu.shares"%self.username,'w').write(str(cpu_shares))
        if cfs_quota:
            open("/sys/fs/cgroup/cpu/%s/cpu.cfs_quota_us"%self.username,'w').write(str(cfs_quota))

        z = "\n%s  cpu,memory  %s\n"%(self.username, self.username)
        cur = open("/etc/cgrules.conf").read() if os.path.exists("/etc/cgrules.conf") else ''

        if z not in cur:
            open("/etc/cgrules.conf",'a').write(z)
        try:
            pids = self.cmd("ps -o pid -u %s"%self.username, ignore_errors=False).split()[1:]
            self.cmd(["cgclassify", "-g", group] + pids, ignore_errors=True)
            # ignore cgclassify errors, since processes come and go, etc.
        except:
            pass  # ps returns an error code if there are NO processes at all

    def cgclassify(self):
        try:
            pids = self.cmd("ps -o pid -u %s"%self.username, ignore_errors=False).split()[1:]
            self.cmd(["cgclassify"] + pids, ignore_errors=True)
            # ignore cgclassify errors, since processes come and go, etc.":
        except:
            # ps returns an error code if there are NO processes at all (a common condition).
            pids = []

    def create_project_path(self):
        if not os.path.exists(self.project_path):
            #btrfs(['subvolume', 'create', self.project_path])
            os.makedirs(self.project_path)
            if not self._dev:
                os.chown(self.project_path, self.uid, self.uid)

    def create_snapshot_path(self):
        if self._dev:
            return
        if not os.path.exists(self.snapshot_path):
            log("create_snapshot_path")
            btrfs(['subvolume', 'create', self.snapshot_path])
            os.chown(self.snapshot_path, 0, self.uid)  # user = root; group = this project
            os.chmod(self.snapshot_path, 0750)   # -rwxr-x--- = http://www.javascriptkit.com/script/script2/chmodcal3.shtml

    def gs_open(self):
        if os.path.exists(self.project_path):
            log("open: already open")
            self.create_user()
            return

        # more carefully check uuid validity before actually making the project
        check_uuid(self.project_id)

        self.create_snapshot_path()

        if not self.gs_path:
            # no google cloud storage configured
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

        try:
            downloaded = self.gs_get(missing_streams)
        except Exception, mesg:
            mesg = str(mesg)
            if "could not find parent subvolume" in mesg:
                raise
            else:
                log("WARNING: %s", mesg)

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

    def remove_old_sagemathcloud_path(self):
        # temporary -- once we go through and delete all these from all live projects, don't have to have this.
        p = os.path.join(self.project_path, '.sagemathcloud')
        if os.path.exists(p):
            shutil.rmtree(p, ignore_errors=True)

    def ensure_bashrc(self):
        # ensure .bashrc has certain properties
        bashrc = os.path.join(self.project_path, '.bashrc')
        if not os.path.exists(bashrc):
            return
        s = open(bashrc).read()
        changed = False
        if '.sagemathcloud' in s:
            s = '\n'.join([y for y in s.splitlines() if '.sagemathcloud' not in y])
            changed = True
        if 'SAGE_ATLAS_LIB' not in s:
            s += '\nexport SAGE_ATLAS_LIB=/usr/lib/   # do not build ATLAS\n\n'
            changed = True
        if '$HOME/bin:$HOME/.local/bin' not in s:
            s += '\nexport PATH=$HOME/bin:$HOME/.local/bin:$PATH\n\n'
            changed = True
        if changed:
            open(bashrc,'w').write(s)

    def dev_env(self):
        os.environ['PATH'] = "{salvus_root}/smc-project/bin:{salvus_root}/smc_pyutil/smc_pyutil:{path}".format(
                                    salvus_root=os.environ['SALVUS_ROOT'], path=os.environ['PATH'])
        os.environ['SMC_LOCAL_HUB_HOME'] = self.project_path
        os.environ['SMC_HOST'] = 'localhost'
        os.environ['SMC'] = self.smc_path

        # for development, the raw server, jupyter, etc., have to listen on localhost since that is where
        # the hub is running
        os.environ['SMC_PROXY_HOST'] = 'localhost'

    def start(self, cores, memory, cpu_shares, base_url):
        self.remove_old_sagemathcloud_path()  # temporary
        self.ensure_bashrc()
        self.remove_forever_path()    # probably not needed anymore

        self.create_smc_path()
        self.create_user()
        self.rsync_update_snapshot_links()

        os.environ['SMC_BASE_URL'] = base_url

        if self._dev:
            self.dev_env()
            os.chdir(self.project_path)
            self.cmd("smc-local-hub start")
            def started():
                return os.path.exists("%s/local_hub/local_hub.port"%self.smc_path)
            i=0
            while not started():
                time.sleep(0.1)
                i += 1
                sys.stdout.flush()
                if i >= 100:
                    return
            return

        pid = os.fork()
        if pid == 0:
            try:
                os.setgid(self.uid)
                os.setuid(self.uid)
                os.environ['HOME'] = self.project_path
                os.environ['SMC'] = self.smc_path
                os.environ['USER'] = os.environ['USERNAME'] =  os.environ['LOGNAME'] = self.username
                os.environ['MAIL'] = '/var/mail/%s'%self.username
                del os.environ['SUDO_COMMAND']; del os.environ['SUDO_UID']; del os.environ['SUDO_GID']; del os.environ['SUDO_USER']
                os.chdir(self.project_path)
                self.cmd("smc-start")
            finally:
                os._exit(0)
        else:
            os.waitpid(pid, 0)
            self.compute_quota(cores, memory, cpu_shares)

    def stop(self):
        self.save(update_snapshots=False)
        self.killall()
        self.delete_user()
        self.remove_snapshot_link()
        self.remove_smc_path()
        self.remove_forever_path()

    def restart(self, cores, memory, cpu_shares, base_url):
        log = self._log("restart")
        log("first stop")
        self.stop()
        log("then start")
        self.start(cores, memory, cpu_shares, base_url)

    def btrfs_status(self):
        return btrfs_subvolume_usage(self.project_path)

    def get_memory(self, s):
        try:
            t = self.cmd(["smem", "-nu"], verbose=0, timeout=5).splitlines()[-1].split()[1:]
            s['memory'] = dict(zip('count swap uss pss rss'.split(),
                                   [int(x) for x in t]))
        except:
            log("error running memory command")

    def status(self, timeout=60):
        log = self._log("status")
        s = {}

        if not os.path.exists(self.project_path):
            s['state'] = 'closed'
            return s

        s['state'] = 'opened'

        if self._dev:
            if os.path.exists(self.smc_path):
                try:
                    os.environ['HOME'] = self.project_path
                    os.environ['SMC']  = self.smc_path
                    t = os.popen("smc-status").read()
                    t = json.loads(t)
                    s.update(t)
                    if bool(t.get('local_hub.pid',False)):
                        s['state'] = 'running'
                    self.get_memory(s)
                except:
                    log("error running status command")
            return s


        if self.username not in open('/etc/passwd').read():
            return s

        # TODO: really NOT btrfs at all
        try:
            # ignore_errors since if over quota returns nonzero exit code
            v = self.cmd(['quota', '-v', '-u', self.username], verbose=0, ignore_errors=True).splitlines()
            quotas = v[-1]
            # when the user's quota is exceeded, the last column is "ERROR"
            if quotas == "ERROR":
                quotas = v[-2]
            s['disk_MB'] = int(quotas.split()[-6].strip('*'))/1000
        except Exception, mesg:
            log("error computing quota -- %s", mesg)

        if os.path.exists(self.smc_path):
            try:
                os.setgid(self.uid)
                os.setuid(self.uid)
                os.environ['SMC'] = self.smc_path
                t = os.popen("smc-status").read()
                t = json.loads(t)
                s.update(t)
                if bool(t.get('local_hub.pid',False)):
                    s['state'] = 'running'
                self.get_memory(s)
            except:
                log("error running status command")
        return s

    def state(self, timeout=60):
        log = self._log("state")
        s = {}

        if not os.path.exists(self.project_path):
            s['state'] = 'closed'
            return s

        s['state'] = 'opened'
        if self._dev:
            if os.path.exists(self.smc_path):
                try:
                    os.environ['HOME'] = self.project_path
                    os.environ['SMC'] = self.smc_path
                    os.chdir(self.smc_path)
                    t = json.loads(os.popen("smc-status").read())
                    s.update(t)
                    if bool(t.get('local_hub.pid',False)):
                        s['state'] = 'running'
                except Exception, err:
                    log("error running status command -- %s", err)
            return s

        if self.username not in open('/etc/passwd').read():
            return s

        if os.path.exists(self.smc_path):
            try:
                os.setgid(self.uid)
                os.setuid(self.uid)
                os.environ['HOME'] = self.project_path
                os.environ['SMC'] = self.smc_path
                os.chdir(self.smc_path)
                t = json.loads(os.popen("smc-status").read())
                s.update(t)
                if bool(t.get('local_hub.pid',False)):
                    s['state'] = 'running'
            except Exception, err:
                log("error running status command -- %s", err)
        return s

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
            self.delete_subvolume(os.path.join(self.snapshot_path, snapshot))

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

    def gs_save(self, timestamp="", persist=False, max_snapshots=0, dedup=False, archive=True, min_interval=0):
        """
        - persist =  make snapshot that we never automatically delete
        - timestamp = make snapshot with that time
        - max_snapshot - trim old snapshots
        - dedup = run dedup before making the snapshot (dedup potentially saves a *lot* of space in size of stored files, but could take an hour!)
        - archive = save new incremental tar archive file
        - min_interval = error if there is a snapshot that is younger than this many MINUTES (default: 0=disabled); ignored if timestamp is explicitly provided
        """
        self.create_snapshot_path()  # this path must exist in order to save

        if not timestamp:
            if min_interval:
                # check if too soon
                v = self.snapshot_ls()
                if len(v) > 0:
                    newest = v[-1]
                    age    = (time.time() - time.mktime(time.strptime(v[-1][:len('2015-05-03-081013')], TIMESTAMP_FORMAT)))/60.0
                    if age  < min_interval:
                        raise RuntimeError("there is a %sm old snapshot, which is younger than min_interval(=%sm)"%(age, min_interval))

            timestamp = time.strftime(TIMESTAMP_FORMAT)
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
        if archive:
            self.archive()
        return {'timestamp':timestamp}

    def delete_snapshot(self, snapshot):
        target = os.path.join(self.snapshot_path, snapshot)
        self.delete_subvolume(target)
        # sync with gs
        if self.gs_path:
            self.gs_sync()

    def gs_close(self, force=False, nosave=False):
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
            path = os.path.join(self.snapshot_path, x)
            self.delete_subvolume(path)
        # delete subvolume that contains all the snapshots
        if os.path.exists(self.snapshot_path):
            self.delete_subvolume(self.snapshot_path)
        # delete the ~/.smc subvolume
        if os.path.exists(self.smc_path):
            self.delete_subvolume(self.smc_path)
        # delete the project path volume
        if os.path.exists(self.project_path):
            self.delete_subvolume(self.project_path)

    def delete_subvolume(self, path):
        try:
            shutil.rmtree(path)
        except Exception, mesg:
            log("further problem deleting subvolume %s via rmtree -- %s", path, mesg)
        return

        try:
            btrfs(['subvolume', 'delete', path])
        except Exception, mesg:
            # not a volume -- just a directory
            log("problem deleting subvolume %s -- %s", path, mesg)
            try:
                shutil.rmtree(path)
            except Exception, mesg:
                log("further problem deleting subvolume %s via rmtree -- %s", path, mesg)
                for x in os.listdir(path):
                    try:
                        btrfs(['subvolume', 'delete', os.path.join(path,x)])
                    except:
                        pass
                btrfs(['subvolume', 'delete', path])

    def destroy(self):
        # delete locally
        self.close(force=True, nosave=True)
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

    def _exclude(self, prefix='', extras=[]):
        return ['--exclude=%s'%os.path.join(prefix, x) for x in
                ['.sage/cache', '.sage/temp', '.trash', '.Trash',
                 '.sagemathcloud', '.smc', '.node-gyp', '.cache', '.forever',
                 '.snapshots', '*.sage-backup'] + extras]

    def _archive_newer(self, files, archive_path, compression):
        files.sort()
        if len(files) > 0:
            inc = '.incremental'
            newer = ['--newer', '@%s'%time.mktime(time.strptime(files[-1].split('.')[0], TIMESTAMP_FORMAT))]
        else:
            inc = ''
            newer = []
        archive = os.path.join(archive_path, '%s%s.tar.%s'%(
                    time.strftime(TIMESTAMP_FORMAT),inc, compression))
        return newer, archive

    def archive(self, compression='lz4'):
        """
        If self._archive (archive= option to constructor) is nonempty and
        does not start with gs://, then:

            Create self.archive/project_id/timestamp.tar.lz4 (or bz2 or gz), excluding things that probably
            shouldn't be in the tarball.  Use this for archival purposes and so user can
            download a backup of their project.

        If self.archive starts with gs://, then:

            Do the same as above, except in the given Google cloud storage bucket.
        """
        log = self._log('archive')
        if not self._archive:
            log('archive: skipping since no archive path set')
            return
        archive_path = os.path.join(self._archive, self.project_id)
        log("to %s", archive_path)

        use_pipe = False
        if compression == 'bz2':
            opts = '-jcf'
        elif compression == 'gz':
            opts = '-zcf'
        elif compression == 'lz4':
            opts = '-cf'
            use_pipe = True
        else:
            raise RuntimeError("compression (='%s') must be one of 'lz4', 'gz', 'bz2'"%compression)

        def create_tarball(newer, target):
            more_opts = newer + self._exclude('') + [self.project_id]
            try:
                CUR = os.curdir
                os.chdir(self.btrfs)
                if use_pipe:
                    s = self.cmd("tar %s - %s | %s > %s"%(opts, ' '.join(more_opts), compression, target))
                    # we check by looking at output since pipes don't propogate
                    # error status (and we're not using bash) -- see http://stackoverflow.com/questions/1550933/catching-error-codes-in-a-shell-pipe
                    if 'Exiting with failure status due to previous errors' in s:
                        raise RuntimeError("error creating archive tarball -- %s"%s)
                else:
                    self.cmd(['tar', opts, target]  + more_opts)
            except Exception, mesg:
                # make this a warning because taring things like sshfs mounted directories leads to errors
                # that can't be avoided.
                log("WARNING: problem creating tarball -- %s", mesg)
            finally:
                os.chdir(CUR)

        if archive_path.startswith('gs://'):
            log("google cloud storage")
            newer, archive = self._archive_newer(gs_ls(archive_path), archive_path, compression)
            try:
                tmp_path = tempfile.mkdtemp()
                local = os.path.join(tmp_path, 'a.tar.%s'%compression)
                create_tarball(newer, local)
                gsutil(['-q', '-o', 'GSUtil:parallel_composite_upload_threshold=150M', '-m', 'cp'] + [local] + [archive])
                os.unlink(local)
            finally:
                shutil.rmtree(tmp_path)
        else:
            log("local filesystem")
            if not os.path.exists(archive_path):
                os.makedirs(archive_path)
            # very important that the archive path is not world readable...
            os.chmod(self._archive, stat.S_IRWXU)
            newer, archive = self._archive_newer(os.listdir(archive_path), archive_path, compression)
            try:
                cur = os.curdir
                os.chdir(self.btrfs)
                create_tarball(newer, archive)
                return {'path':archive, 'size':os.lstat(archive).st_size}
            finally:
                os.chdir(cur)

    def restore_archive(self):
        log = self._log('restore_archive')
        # only implemented for lz4
        archive_path = os.path.join(self._archive, self.project_id)
        try:
            tmp_path = tempfile.mkdtemp()
            log("get files from cloud storage")
            gsutil(['-m', 'rsync', archive_path, tmp_path])
            log("extract each tarball in turn")
            target = os.path.join(self.project_path, "archive")
            if not os.path.exists(target):
                os.mkdir(target)
            for tarball in os.listdir(tmp_path):
                log("extracting %s", tarball)
                if tarball.endswith('.lz4'):
                    self.cmd("cd '%s' && cat '%s/%s'  | lz4 -d  - | tar xf -"%(target, tmp_path, tarball))
            self.chown(target)
        finally:
            shutil.rmtree(tmp_path)

    def directory_listing(self, path, hidden=True, time=True, start=0, limit=-1):
        """
        Return in JSON-format, listing of files in the given path.

        - path = relative path in project; *must* resolve to be
          under PROJECTS_PATH/project_id or get an error.
        """
        abspath = os.path.abspath(os.path.join(self.project_path, path))
        if not abspath.startswith(self.project_path):
            raise RuntimeError("path (=%s) must be contained in project path %s"%(path, self.project_path))
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

    def read_file(self, path, maxsize):
        """
        path = relative path/filename in project

        It:

        - *must* resolve to be under PROJECTS_PATH/project_id or get an error
        - it must have size in bytes less than the given limit
        - to download the directory blah/foo, request blah/foo.zip

        Returns base64-encoded file as an object:

            {'base64':'... contents ...'}

        or {'error':"error message..."} in case of an error.
        """
        abspath = os.path.abspath(os.path.join(self.project_path, path))
        base, ext = os.path.splitext(abspath)
        if not abspath.startswith(self.project_path):
            raise RuntimeError("path (=%s) must be contained in project path %s"%(path, self.project_path))
        if not os.path.exists(abspath):
            if ext != '.zip':
                raise RuntimeError("path (=%s) does not exist"%path)
            else:
                if os.path.exists(base) and os.path.isdir(base):
                    abspath = os.path.splitext(abspath)[0]
                else:
                    raise RuntimeError("path (=%s) does not exist and neither does %s"%(path, base))

        filename = os.path.split(abspath)[-1]
        if os.path.isfile(abspath):
            # a regular file
            # TODO: compress the file before base64 encoding (and corresponding decompress
            # in hub before sending to client)
            size = os.lstat(abspath).st_size
            if size > maxsize:
                raise RuntimeError("path (=%s) must be at most %s bytes, but it is %s bytes"%(path, maxsize, size))
            content = open(abspath).read()
        else:
            # a zip file in memory from a directory tree
            # REFERENCES:
            #   - http://stackoverflow.com/questions/1855095/how-to-create-a-zip-archive-of-a-directory
            #   - https://support.google.com/accounts/answer/6135882
            import zipfile
            from cStringIO import StringIO
            output  = StringIO()
            relroot = os.path.abspath(os.path.join(abspath, os.pardir))

            size = 0
            zip = zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, False)
            for root, dirs, files in os.walk(abspath):
                # add directory (needed for empty dirs)
                zip.write(root, os.path.relpath(root, relroot))
                for file in files:
                    filename = os.path.join(root, file)
                    if os.path.isfile(filename): # regular files only
                        size += os.lstat(filename).st_size
                        if size > maxsize:
                            raise RuntimeError("path (=%s) must be at most %s bytes, but it is at least %s bytes"%(path, maxsize, size))
                        arcname = os.path.join(os.path.relpath(root, relroot), file)
                        zip.write(filename, arcname)

            # Mark the files as having been created on Windows so that
            # Unix permissions are not inferred as 0000.
            for zfile in zip.filelist:
                zfile.create_system = 0
            zip.close()
            content = output.getvalue()
        import base64
        return {'base64':base64.b64encode(content)}

    def makedirs(self, path, chown=True):
        log = self._log('makedirs')
        if os.path.exists(path) and not os.path.isdir(path):
            try:
                log("moving %s", path)
                os.rename(path, path+".backup")
            except:
                log("ok, then remove %s", path)
                os.unlink(path)

        if not os.path.exists(path):
            log("creating %s"%path)
            os.chdir(self.project_path)
            def makedirs(name):  # modified from os.makedirs to chown each newly created path segment
                head, tail = os.path.split(name)
                if not tail:
                    head, tail = os.path.split(head)
                if head and tail and not os.path.exists(head):
                    try:
                        makedirs(head)
                    except OSError, e:
                        # be happy if someone already created the path
                        if e.errno != errno.EEXIST:
                            raise
                    if tail == os.curdir:           # xxx/newdir/. exists if xxx/newdir exists
                        return
                os.mkdir(name, 0700)
                if not self._dev:
                    os.chown(name, self.uid, self.uid)
            makedirs(path)

    def mkdir(self, path):               # relative path in project; must resolve to be under PROJECTS_PATH/project_id
        log = self._log("mkdir")
        log("ensuring path %s exists", path)
        project_id = self.project_id
        project_path = self.project_path
        abspath = os.path.abspath(os.path.join(project_path, path))
        if not abspath.startswith(project_path):
            raise RuntimeError("path (=%s) must be contained in project path %s"%(path, project_path))
        if not os.path.exists(abspath):
            self.makedirs(abspath)

    def copy_path(self,
                  path,                   # relative path to copy; must resolve to be under PROJECTS_PATH/project_id
                  target_hostname = 'localhost', # list of hostnames (foo or foo:port) to copy files to
                  target_project_id = "",      # project_id of destination for files; must be open on destination machine
                  target_path     = None,   # path into project; defaults to path above.
                  overwrite_newer = False,# if True, newer files in target are copied over (otherwise, uses rsync's --update)
                  delete_missing  = False,# if True, delete files in dest path not in source, **including** newer files
                  backup          = False,# if True, create backup files with a tilde
                  exclude_history = False,# if True, don't copy .sage-history files.
                  timeout         = None,
                  bwlimit         = None,
                 ):
        """
        Copy a path (directory or file) from one project to another.

        WARNING: btrfs projects mountpoint assumed same on target machine.
        """
        log = self._log("copy_path")

        if target_path is None:
            target_path = path

        # check that both UUID's are valid -- these will raise exception if there is a problem.
        if not target_project_id:
            target_project_id = self.project_id

        check_uuid(target_project_id)

        # parse out target rsync port, if necessary
        if ':' in target_hostname:
            target_hostname, target_port = target_hostname.split(':')
        else:
            target_port = '22'

        # determine canonical absolute path to source
        src_abspath = os.path.abspath(os.path.join(self.project_path, path))
        if not src_abspath.startswith(self.project_path):
            raise RuntimeError("source path (=%s) must be contained in project_path (=%s)"%(
                    path, self.project_path))

        # determine canonical absolute path to target
        target_project_path = os.path.join(self.btrfs, target_project_id)
        target_abspath = os.path.abspath(os.path.join(target_project_path, target_path))
        if not target_abspath.startswith(target_project_path):
            raise RuntimeError("target path (=%s) must be contained in target project path (=%s)"%(
                    target_path, target_project_path))

        if os.path.isdir(src_abspath):
            src_abspath    += '/'
            target_abspath += '/'

        # handle options
        options = []
        if not overwrite_newer:
            options.append("--update")
        if backup:
            options.extend(["--backup"])
        if delete_missing:
            # IMPORTANT: newly created files will be deleted even if overwrite_newer is True
            options.append("--delete")
        if bwlimit:
            options.extend(["--bwlimit", bwlimit])
        if timeout:
            options.extend(["--timeout", timeout])

        u = uid(target_project_id)
        try:
            if socket.gethostname() == target_hostname:
                # we *have* to do this, due to the firewall!
                target_hostname = 'localhost'
            w = ['-e', 'ssh -o StrictHostKeyChecking=no -p %s'%target_port,
                 src_abspath,
                 "%s:%s"%(target_hostname, target_abspath)]
            if exclude_history:
                exclude = self._exclude('', extras=['*.sage-history'])
            else:
                exclude = self._exclude('')
            v = (['rsync'] + options +
                     ['-zaxs',   # compressed, archive mode (so leave symlinks, etc.), don't cross filesystem boundaries
                      '--chown=%s:%s'%(u,u),
                      "--ignore-errors"] + exclude + w)
            # do the rsync
            self.cmd(v, verbose=2)
        except Exception, mesg:
            mesg = str(mesg)
            # get rid of scary (and pointless) part of message
            s = "avoid man-in-the-middle attacks"
            i = mesg.rfind(s)
            if i != -1:
                mesg = mesg[i+len(s):]
            log("rsync error: %s", mesg)
            raise RuntimeError(mesg)

    def tar_save(self, snapshot=True):
        log = self._log('tar_save')
        gs_path = os.path.join('gs://smc-tar', self.project_id)
        log("to %s", gs_path)
        opts = '-cf'

        try:
            tmp_path = tempfile.mkdtemp()
            data = os.path.join(tmp_path, 'data')
            try:
                gsutil(['cp', os.path.join(gs_path,'data'), data])
            except:
                pass

            local   = os.path.join(tmp_path, 'a.tar.lz4')
            try:
                now = time.strftime(TIMESTAMP_FORMAT)
                target_path = self.project_id
                opts = self._exclude('') + ['.'] + ['--listed-incremental', data]
                CUR = os.curdir
                os.chdir(target_path)
                log("changing to %s", target_path)
                s = self.cmd("tar -cf - %s | lz4 > %s"%(' '.join(opts), local))
                # we check errors by looking at output since pipes don't propogate
                # error status (and we're not using bash) --
                # see http://stackoverflow.com/questions/1550933/catching-error-codes-in-a-shell-pipe
                if 'Exiting with failure status due to previous errors' in s:
                    raise RuntimeError("error creating archive tarball -- %s"%s)
                target = os.path.join(gs_path, now) + ".tar.lz4"

                # the following three could be done in parallel...
                gsutil(['-q', '-o', 'GSUtil:parallel_composite_upload_threshold=150M', '-m', 'cp'] + [local, target])
                gsutil(['cp', data, "%s/data"%gs_path])
                if snapshot:
                    btrfs(['subvolume', 'snapshot', '-r', self.project_path, os.path.join(self.snapshot_path, now)])
            except Exception, mesg:
                # make this a warning because taring things like sshfs mounted directories leads to errors
                # that can't be avoided.
                log("WARNING: problem creating tarball -- %s", mesg)
            finally:
                os.chdir(CUR)
                os.unlink(local)
        finally:
            shutil.rmtree(tmp_path)

    def tar_open(self, snapshot=True):
        log = self._log('tar_open')

        self.create_user()
        self.create_project_path()
        self.create_snapshot_link()
        self.create_smc_path()

        gs_path = os.path.join('gs://smc-tar', self.project_id)
        v = os.listdir(self.snapshot_path)
        if len(v) == 0:
            start = ''
        else:
            v.sort()
            start = v[-1]

        log("get missing files from cloud storage")
        w = gs_ls_nocache(gs_path)
        v = [x for x in w if x.endswith('.lz4')]
        need = [x for x in v if x.split('.')[0] > start]
        if len(need) == 0:
            log("nothing missing")
            return
        else:
            log("need: %s", need)
        try:
            tmp_path = tempfile.mkdtemp()
            get = [os.path.join(gs_path,x) for x in need]
            if 'data' in w:
                get.append(os.path.join(gs_path,'data'))
            #gsutil(['-m', 'cp', ' '.join(get), tmp_path])
            os.system("gsutil -m cp %s %s"%( ' '.join(get), tmp_path))
            log("extract each tarball in order")
            data = os.path.join(tmp_path, 'data')
            for tarball in sorted([x for x in os.listdir(tmp_path) if x.endswith('lz4')]):
                log("extracting %s", tarball)
                self.cmd("cd '%s' && cat '%s/%s'  | lz4 -d  - | tar -xf - --listed-incremental=%s"%(self.project_path, tmp_path, tarball, data))
                if snapshot:
                    name = tarball.split('.')[0]
                    target = os.path.join(self.snapshot_path, name)
                    if not os.path.exists(target):
                        btrfs(['subvolume', 'snapshot', '-r', self.project_path, target])
        finally:
            #shutil.rmtree(tmp_path)
            pass


    def tar_backup(self):
        log = self._log('tar_backup')
        backup_path = "/backups"
        if not os.path.exists(backup_path):
            raise RuntimeError("create the backup path %s"%backup_path)
        path = os.path.join(backup_path, self.project_id)
        if not os.path.exists(path):
            os.mkdir(path)
        data = os.path.join(path, 'data')
        now = time.strftime(TIMESTAMP_FORMAT)
        target= os.path.join(path, '%s.tar.lz4'%now)
        opts = self._exclude(self.project_id) + [self.project_id] + ['--listed-incremental', data, '--no-check-device']
        CUR = os.curdir
        try:
            os.chdir('/projects')
            s = self.cmd("tar -cf - %s | lz4 > %s"%(' '.join(opts), target))
            # we check errors by looking at output since pipes don't propogate
            # error status (and we're not using bash) --
            # see http://stackoverflow.com/questions/1550933/catching-error-codes-in-a-shell-pipe
            if 'Exiting with failure status due to previous errors' in s:
                raise RuntimeError("error creating archive tarball -- %s"%s)
        except Exception, mesg:
            os.unlink(target)
            raise
        finally:
            # good to have a backup of data at the point when this was made, in case we want to start over there.
            shutil.copyfile(data, '%s-%s'%(data, now))
            os.chdir(CUR)

    def rsync_update_snapshot_links(self):
        if self._dev:
            return
        log = self._log("rsync_update_snapshot_links")
        log("updating the snapshot links in %s",  self.snapshot_link)
        tm = time.time()
        if not os.path.exists(self.snapshot_link):
            log("making snapshot path")
            self.makedirs(self.snapshot_link)
        # The file /projects/snapshots has one line per snapshot.  It is created
        # periodically by a crontab running as root:
        #    */3 * * * * ls -1 /snapshots/ > /projects/snapshots
        if not os.path.exists('/projects/snapshots'):
            log("no file '/projects/snapshots' so skipping update for now")
            return
        snapshots = open('/projects/snapshots').readlines()
        snapshots.sort()
        n = 300
        snapshots = snapshots[-n:]  # limit to n for now
        names = set([x[:17] for x in snapshots])
        for y in os.listdir(self.snapshot_link):
            if y not in names:
                try:
                    os.unlink(os.path.join(self.snapshot_link, y))
                except: pass
        #log("%s snapshots", len(snapshots))
        for x in snapshots:
            target = os.path.join(self.snapshot_link, x[:17])
            source = "/snapshots/%s/%s"%(x.strip(), self.project_id)
            if os.path.exists(source):
                #log("%s exists", source)
                if not os.path.lexists(target):
                    try:
                        os.symlink(source, target)
                    except:
                         # potential race condition
                        pass
            else:
                if os.path.lexists(target):
                    #log("removing target %s", target)
                    try:
                        os.unlink(target)
                    except: pass
        log("finished updating snapshot links in %s seconds", time.time()-tm)


    def rsync_open(self, cores=None, memory=None, cpu_shares=None, sync_only=False):
        self.create_project_path()
        #self.disk_quota(0)  # important to not have a quota while opening, since could fail to complete...
        remote = self.storage
        if remote and not self._dev:
            src = "%s:/projects/%s"%(remote, self.project_id)
            target = self.project_path
            verbose = False
            # max-size is a temporary measure in case somebody makes a huge sparse file
            # See https://gist.github.com/KartikTalwar/4393116 for discussion of ssh options.
            # You must add "Ciphers arcfour" to /etc/ssh/sshd and "server sshd restart" on the
            # the storage server.
            # We are getting over 3GB/minute (55MB/s) in same DC (with 4 cores) on GCE using this.
            try:
                try:
                    cmd("rsync -axH --max-size=50G --delete %s -e 'ssh -T -c arcfour -o Compression=no -x -o StrictHostKeyChecking=no' %s/ %s/ </dev/null"%(' '.join(self._exclude('')), src, target))
                except Exception, mesg:
                    mesg = str(mesg)
                    if 'failed: No such file or directory' in mesg:
                        # special case -- new project
                        pass
                    else:
                        raise
            except Exception, mesg:
                open(self.open_fail_file,'w').write(str(mesg))
                raise
            else:
                if os.path.exists(self.open_fail_file):
                    os.unlink(self.open_fail_file)
        if sync_only:
            return
        self.create_smc_path()
        self.create_user()
        self.rsync_update_snapshot_links()
        if cores is not None:
            self.compute_quota(cores, memory, cpu_shares)

    def rsync_save(self, timestamp="", persist=False, max_snapshots=0, dedup=False, archive=True, min_interval=0, update_snapshots=True):  # all options ignored for now
        if self._dev:
            return
        if os.path.exists(self.open_fail_file):
            mode = "--update"
            log("updating instead, since last open failed -- don't overwrite existing files that possibly weren't downloaded")
        else:
            mode = "--delete --delete-excluded"
        remote = self.storage
        if remote:
            src = self.project_path
            target = "%s:/projects/%s"%(remote, self.project_id)
            verbose = False
            # max-size is a temporary measure in case somebody makes a huge sparse file
            # Saving on a fast local SSD if nothing changed is VERY fast.

            s = "rsync -axH --max-size=50G --ignore-errors %s %s -e 'ssh -T -c arcfour -o Compression=no -x  -o StrictHostKeyChecking=no' %s/ %s/ </dev/null"%(mode, ' '.join(self._exclude('')), src, target)
            log(s)
            if not os.system(s):
                log("migrate_live --- WARNING: rsync issues...")   # these are unavoidable with fuse mounts, etc.
        if update_snapshots:
            self.rsync_update_snapshot_links()
        if os.path.exists(self.open_fail_file):
            log("try to fix that open failed at some point")
            self.rsync_open(sync_only=True)


    def rsync_close(self, force=False, nosave=False):
        if not nosave:
            self.save()
        # kill all processes by user, since they may lock removing subvolumes
        self.killall()
        # delete unix user -- no longer needed
        self.delete_user()
        # remove quota, since certain operations below may fail at quota
        self.disk_quota(0)
        # delete the ~/.sagemathcloud subvolume
        #if os.path.exists(self.smc_path):
        #    self.delete_subvolume(self.smc_path)
        # delete the project path volume
        if os.path.exists(self.project_path):
            self.delete_subvolume(self.project_path)

Project.open = Project.rsync_open
Project.close = Project.rsync_close
Project.save = Project.rsync_save


def snapshot(five, hourly, daily, weekly, monthly, mnt):
    log("snapshot")
    snapdir = os.path.join(mnt, '.snapshots')
    # get list of all snapshots
    snapshots = cmd(['ls', snapdir], verbose=0).splitlines()
    snapshots.sort()
    # create missing snapshots
    now = time.time() # time in seconds since epoch
    for name, interval in [('five',5), ('hourly',60), ('daily',60*24), ('weekly',60*24*7), ('monthly',60*24*7*4)]:
        # Is there a snapshot with the given name that is within the given
        # interval of now?  If not, make snapshot.
        v = [s for s in snapshots if s.endswith('-'+name)]
        if len(v) == 0:
            age = 9999999999 #infinite
        else:
            newest = v[-1]
            n = len('2015-05-03-081013')
            t = time.mktime(time.strptime(newest[:n], TIMESTAMP_FORMAT))
            age = (now - t)/60.  # age in minutes since snapshot
        if age > interval:
            # make the snapshot
            snapname = "%s-%s"%(time.strftime(TIMESTAMP_FORMAT), name)
            target = os.path.join(snapdir, snapname)
            log('creating snapshot %s', target)
            btrfs(['subvolume', 'snapshot', '-r', mnt, target])
            v.append(snapname)
        max_snaps = locals()[name]
        if len(v) > max_snaps:
            # delete out-dated snapshots
            for i in range(len(v) - max_snaps):
                target = os.path.join(snapdir, v[i])
                log("deleting snapshot %s", target)
                btrfs(['subvolume', 'delete', target])

def tar_backup_all():
    """
    Run tar backup on every project in the /projects directory.
    (LATER add option to only run on those whose directory timestamp is recent...)
    """
    v = os.listdir('/projects')
    v.sort()
    n = len(v)
    i = 0
    t0 = time.time()
    for project_id in v:
        if len(project_id) != 36:
            continue
        i += 1
        t = time.time()
        elapsed = t - t0
        remaining = ((elapsed / i) * (n - i))/3600.0
        log("%s/%s: %s (elapsed=%s hours, remaining=%s hours)", i, n, project_id, elapsed/3600, remaining)
        P = Project(project_id, '/projects')
        P.tar_backup()
        log("time=%s", time.time()-t)

def main():
    import argparse
    parser = argparse.ArgumentParser(description="GS = [G]oogle Cloud Storage / [B]trfs - based project storage system")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser_snapshot = subparsers.add_parser('snapshot', help='create/trim the snapshots for btrfs-based storage')
    parser_snapshot.add_argument("--five", help="number of five-minute snapshots to retain", default=12*6, type=int)
    parser_snapshot.add_argument("--hourly", help="number of hourly snapshots to retain", default=24*7, type=int)
    parser_snapshot.add_argument("--daily", help="number of daily snapshots to retain", default=30, type=int)
    parser_snapshot.add_argument("--weekly", help="number of weekly snapshots to retain", default=20, type=int)
    parser_snapshot.add_argument("--monthly", help="number of monthly snapshots to retain", default=12, type=int)
    parser_snapshot.set_defaults(func=lambda args:snapshot(five=args.five, hourly=args.hourly,
                                           daily=args.daily, weekly=args.weekly, monthly=args.monthly, mnt=args.btrfs))

    parser_backup = subparsers.add_parser('tar_backup_all', help='')
    parser_backup.set_defaults(func=lambda args:tar_backup_all())

    def project(args):
        kwds = {}
        for k in ['project_id', 'btrfs', 'bucket', 'storage']:
            if hasattr(args, k):
                kwds[k] = getattr(args, k)
        return Project(**kwds)

    # This is a generic parser for all subcommands that operate on a collection of projects.
    # It's ugly, but it massively reduces t`he amount of code.
    def f(subparser):
        function = subparser.prog.split()[-1]
        def g(args):
            special = [k for k in args.__dict__.keys() if k not in ['project_id', 'btrfs', 'bucket', 'storage', 'func', 'archive', 'dev']]
            out = []
            errors = False
            for project_id in args.project_id:
                kwds = dict([(k,getattr(args, k)) for k in special])
                try:
                    result = getattr(Project(project_id=project_id, btrfs=args.btrfs, bucket=args.bucket, storage=args.storage, archive=args.archive, dev=args.dev), function)(**kwds)
                except Exception, mesg:
                    raise #-- for debugging
                    errors = True
                    result = {'error':str(mesg), 'project_id':project_id}
                out.append(result)
            if len(out) == 1:
                if not out[0]:
                    out[0] = {}
                print json.dumps(out[0])
            else:
                if not out:
                    out = {}
                print json.dumps(out)
            if errors:
                sys.exit(1)
        subparser.add_argument("project_id", help="UUID of project", type=str, nargs="+")
        subparser.set_defaults(func=g)

    # optional arguments to all subcommands
    parser.add_argument("--dev", default=False, action="store_const", const=True,
                        help="devel mode where everything runs insecurely as the same user (no sudo)")

    parser.add_argument("--btrfs", help="btrfs mountpoint [default: /projects or $SMC_BTRFS if set]",
                        dest="btrfs", default=os.environ.get("SMC_BTRFS","/projects"), type=str)

    parser.add_argument("--bucket",
                        help="read/write google cloud storage bucket gs://... [default: $SMC_BUCKET or ''=do not use google cloud storage]",
                        dest='bucket', default=os.environ.get("SMC_BUCKET",""), type=str)

    #TODO: the storage0-us thing below is a horrible temporary hack
    parser.add_argument("--storage",
                        help="", dest='storage', default='storage0-us' if socket.gethostname().startswith('compute') else '', type=str)

    # if enabled, we make incremental tar archives on every save operation and
    # upload them to this bucket.  These are made directly using tar on the filesystem,
    # so (1) aren't impacted if btrfs streams were corrupted for some reason, and
    # (2) no snapshots are deleted, so this provides a good way to recover in case
    # of major user error, while not providing normal access.  The bucket used below
    # should be a Google nearline bucket.
    parser.add_argument("--archive",
                        help="tar archive target -- make incremental tar archive on all saves (filesystem path or write/listing-only google cloud storage bucket) [default: $SMC_ARCHIVE or ''=do not use]",
                        dest='archive', default=os.environ.get("SMC_ARCHIVE",""), type=str)

    # open a project
    parser_open = subparsers.add_parser('open', help='Open project')
    parser_open.add_argument("--cores", help="number of cores (default: 0=don't change/set) float", type=float, default=0)
    parser_open.add_argument("--memory", help="megabytes of RAM (default: 0=no change/set) int", type=int, default=0)
    parser_open.add_argument("--cpu_shares", help="relative share of cpu (default: 0=don't change/set) int", type=int, default=0)
    f(parser_open)

    # start project running
    parser_start = subparsers.add_parser('start', help='start project running (open and start daemon)')
    parser_start.add_argument("--cores", help="number of cores (default: 0=don't change/set) float", type=float, default=0)
    parser_start.add_argument("--memory", help="megabytes of RAM (default: 0=no change/set) int", type=int, default=0)
    parser_start.add_argument("--cpu_shares", help="relative share of cpu (default: 0=don't change/set) int", type=int, default=0)
    parser_start.add_argument("--base_url", help="passed on to local hub server so it can properly launch raw server, jupyter, etc.", type=str, default='')
    f(parser_start)

    parser_status = subparsers.add_parser('status', help='get status of servers running in the project')
    parser_status.add_argument("--timeout", help="seconds to run command", default=60, type=int)

    f(parser_status)

    parser_state = subparsers.add_parser('state', help='get state of project')  # {state:?}
    parser_state.add_argument("--timeout", help="seconds to run command", default=60, type=int)
    f(parser_state)


    # disk quota
    parser_disk_quota = subparsers.add_parser('disk_quota', help='set disk quota')
    parser_disk_quota.add_argument("quota", help="quota in MB (or 0 for no disk_quota).", type=float)
    f(parser_disk_quota)

    # compute quota
    parser_compute_quota = subparsers.add_parser('compute_quota', help='set compute quotas')
    parser_compute_quota.add_argument("--cores", help="number of cores (default: 0=don't change/set) float", type=float, default=0)
    parser_compute_quota.add_argument("--memory", help="megabytes of RAM (default: 0=no change/set) float", type=float, default=0)
    parser_compute_quota.add_argument("--cpu_shares", help="relative share of cpu (default: 0=don't change/set) float", type=float, default=0)
    f(parser_compute_quota)

    # create Linux user for project
    parser_create_user = subparsers.add_parser('create_user', help='create Linux user')
    parser_create_user.add_argument("--login_shell", help="", type=str, default='/bin/bash')
    f(parser_create_user)

    # delete Linux user for project
    parser_delete_user = subparsers.add_parser('delete_user', help='delete Linux user')
    f(parser_delete_user)

    # kill all processes by Linux user for project
    parser_killall = subparsers.add_parser('killall', help='kill all processes by this user')
    f(parser_killall)

    # kill all processes and delete unix user.
    f(subparsers.add_parser('stop', help='kill all processes and delete user'))

    parser_restart = subparsers.add_parser('restart', help='stop then start project')
    parser_restart.add_argument("--cores", help="number of cores (default: 0=don't change/set) float", type=float, default=0)
    parser_restart.add_argument("--memory", help="megabytes of RAM (default: 0=no change/set) int", type=int, default=0)
    parser_restart.add_argument("--cpu_shares", help="relative share of cpu (default: 0=don't change/set) int", type=int, default=0)
    parser_restart.add_argument("--base_url", help="passed on to local hub server so it can properly launch raw server, jupyter, etc.", type=str, default='')
    f(parser_restart)


    # close project -- deletes all local files
    parser_close = subparsers.add_parser('close',
                     help='close this project removing all files from this local host (does *NOT* save first)')
    parser_close.add_argument("--force",
                              help="force close even if google cloud storage not configured (so project lost)",
                              default=False, action="store_const", const=True)
    parser_close.add_argument("--nosave",
                              help="do not save a snapshot before close (will loose all data since last save)",
                              default=False, action="store_const", const=True)
    f(parser_close)

    # destroy project -- delete local files **and** files in Google cloud storage.
    parser_destroy = subparsers.add_parser('destroy',
                     help='DANGEROUS -- completely destroy this project (almost) **EVERYWHERE** (including cloud storage, though not from incremental tarball archive)')
    f(parser_destroy)

    # save project
    parser_save = subparsers.add_parser('save', help='snapshot project, delete old snapshots, sync with google cloud storage')
    parser_save.add_argument("--max_snapshots", help="maximum number of snapshots (if given may delete some snapshots)", default=0, type=int)
    parser_save.add_argument("--timestamp", help="optional timestamp in the form %Y-%m-%d-%H%M%S", default="", type=str)
    parser_save.add_argument("--persist", help="if given, won't automatically delete",
                             default=False, action="store_const", const=True)
    parser_save.add_argument("--dedup", help="run dedup before making the snapshot -- can take a LONG time, but saves a lot on snapshots stored in google cloud storage",
                             default=False, action="store_const", const=True)
    parser_save.add_argument("--min_interval", help="fail if there is a snapshot that is younger than this many MINUTES", default=0, type=int)
    f(parser_save)

    # delete old snapshots in project
    parser_delete_old_snapshots = subparsers.add_parser('delete_old_snapshots', help='delete some snapshots, mainly by deleting older ones')
    parser_delete_old_snapshots.add_argument("max_snapshots", help="maximum number of snapshots", type=int)
    f(parser_delete_old_snapshots)

    # sync project with google cloud storage.
    parser_sync = subparsers.add_parser('sync', help='sync project with google cloud storage, without first saving a new snapshot')
    f(parser_sync)

    # delete a particular snapshot
    parser_delete_snapshot = subparsers.add_parser('delete_snapshot', help='delete a particular snapshot')
    parser_delete_snapshot.add_argument("snapshot", help="snapshot to delete", type=str)
    f(parser_delete_snapshot)

    # delete the older versions of project from google cloud storage, which get left in case
    # project is opened on a new machine, where the btrfs uuid's are different.
    f(subparsers.add_parser('delete_old_versions',
                            help='delete all old versions from Google cloud storage'))

    # dedup contents of project -- might save disk space
    parser_dedup = subparsers.add_parser('dedup',
                            help='dedup live project (WARNING: could take a long time)')
    parser_dedup.add_argument("--verbose", default=False, action="store_const", const=True)
    f(parser_dedup)

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

    f(parser_directory_listing)

    parser_read_file = subparsers.add_parser('read_file',
         help="read a file/directory; outputs {'base64':'..content..'}; use directory.zip to get directory/ as a zip")
    parser_read_file.add_argument("path", help="relative path of a file/directory in project (required)", type=str)
    parser_read_file.add_argument("--maxsize", help="maximum file size in bytes to read (bigger causes error)",
                                   dest="maxsize", default=3000000, type=int)
    f(parser_read_file)

    parser_copy_path = subparsers.add_parser('copy_path', help='copy a path from one project to another')
    parser_copy_path.add_argument("--target_hostname", help="hostname of target machine for copy (default: localhost)",
                                  dest="target_hostname", default='localhost', type=str)
    parser_copy_path.add_argument("--target_project_id", help="id of target project (default: this project)",
                                   dest="target_project_id", default="", type=str)
    parser_copy_path.add_argument("--path", help="relative path or filename in project",
                                  dest="path", default='', type=str)
    parser_copy_path.add_argument("--target_path", help="relative path into target project (defaults to --path)",
                                   dest="target_path", default=None, type=str)
    parser_copy_path.add_argument("--overwrite_newer", help="if given, newer files in target are copied over",
                                   dest="overwrite_newer", default=False, action="store_const", const=True)
    parser_copy_path.add_argument("--delete_missing", help="if given, delete files in dest path not in source",
                                   dest="delete_missing", default=False, action="store_const", const=True)
    parser_copy_path.add_argument("--exclude_history", help="if given, do not copy *.sage-history files",
                                   dest="exclude_history", default=False, action="store_const", const=True)
    parser_copy_path.add_argument("--backup", help="make ~ backup files instead of overwriting changed files",
                                   dest="backup", default=False, action="store_const", const=True)
    f(parser_copy_path)

    parser_mkdir = subparsers.add_parser('mkdir', help='ensure path exists')
    parser_mkdir.add_argument("path", help="relative path or filename in project",
                               type=str)
    f(parser_mkdir)

    parser_archive = subparsers.add_parser('archive', help='create archive tarball of the project')
    parser_archive.add_argument("--compression",
                    help="compression format -- 'lz4' (default), 'gz' or 'bz2'",
                    default="lz4",dest="compression")
    f(parser_archive)


    parser_restore_archive = subparsers.add_parser('restore_archive', help='restore project by extracting all tarballs in archive')
    f(parser_restore_archive)

    parser_tar_save = subparsers.add_parser('tar_save', help='save incremental tarball')
    f(parser_tar_save)

    parser_tar_open = subparsers.add_parser('tar_open', help='open using incremental tarballs')
    f(parser_tar_open)


    f(subparsers.add_parser('tar_backup', help='create an incremental tarball'))

    parser_migrate_live = subparsers.add_parser('migrate_live', help='')
    parser_migrate_live.add_argument("--port", help="", default=22, type=int)
    parser_migrate_live.add_argument("--verbose", default=False, action="store_const", const=True)
    parser_migrate_live.add_argument("--subdir", default=False, action="store_const", const=True)
    parser_migrate_live.add_argument("hostname", help="hostname[:path]", type=str)
    f(parser_migrate_live)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
