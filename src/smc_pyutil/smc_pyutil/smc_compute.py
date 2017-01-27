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


# used in naming streams -- changing this would break all existing data...
TO      = "-to-"

# appended to end of snapshot name to make it persistent (never automatically deleted)
PERSIST = "-persist"

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"

# This is the quota for the .smc directory; must be
# significantly bigger than that directory, and hold user logs.
SMC_TEMPLATE_QUOTA = '1000m'

USER_SWAP_MB = 1000  # amount of swap users get

import errno, hashlib, json, math, os, platform, re, shutil, signal, socket, stat, sys, tempfile, time, uuid

from subprocess import Popen, PIPE

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"
USER_SWAP_MB     = 1000  # amount of swap users get in addition to how much RAM they have.
PLATFORM         = platform.system().lower()
PROJECTS         = '/projects'

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
        assert uuid.UUID(u).get_version() == 4
    except (AssertionError, ValueError), mesg:
        raise RuntimeError("invalid uuid (='%s')"%u)

def uid(project_id):
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    # 2^31-1=max uid which works with FUSE and node (and Linux, which goes up to 2^32-2).
    n = int(hashlib.sha512(project_id).hexdigest()[:8], 16)  # up to 2^32
    n //= 2  # up to 2^31   (floor div so will work with python3 too)
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

class Project(object):
    def __init__(self,
                 project_id,          # v4 uuid string
                 dev           = False,  # if true, use special devel mode where everything run as same user (no sudo needed); totally insecure!
                 projects      = PROJECTS,
                 single        = False
                ):
        self._dev    = dev
        self._single = single
        check_uuid(project_id)
        if not os.path.exists(projects):
            if self._dev:
                os.makedirs(projects)
            else:
                raise RuntimeError("mount point %s doesn't exist"%projects)
        self.project_id    = project_id
        self._projects     = projects
        self.project_path  = os.path.join(self._projects, project_id)
        self.smc_path      = os.path.join(self.project_path, '.smc')
        self.forever_path  = os.path.join(self.project_path, '.forever')
        self.uid           = uid(self.project_id)
        self.username      = self.project_id.replace('-','')
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
        if not os.path.exists(self.project_path):
            os.makedirs(self.project_path)
            self.chown(self.project_path)  # only chown if just made; it's recursive and can be very expensive in general!
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

    def killall(self, grace_s=0.5, max_tries=15):
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
        log("WARNING: failed to kill all procs after %s tries"%max_tries)

    def chown(self, path, recursive=True):
        if self._dev:
            return
        if recursive:
            cmd(["chown", "%s:%s"%(self.uid, self.uid), '-R', path])
        else:
            cmd(["chown", "%s:%s"%(self.uid, self.uid), path])

    def ensure_file_exists(self, src, target):
        target = os.path.abspath(target)
        if not os.path.exists(target):
            self.makedirs(os.path.split(target)[0])
            shutil.copyfile(src, target)
            if USERNAME == "root":
                os.chown(target, self.uid, self.uid)

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
        try:
            self.cmd(["cgcreate", "-g", group])
        except:
            if os.system("cgcreate") != 0:
                # cgroups not installed
                return
            else:
                raise
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
            os.makedirs(self.project_path)
            if not self._dev:
                os.chown(self.project_path, self.uid, self.uid)

    def remove_snapshots_path(self):
        """
        Remove the ~/.snapshots path
        """
        p = os.path.join(self.project_path, '.snapshots')
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
        os.environ['PYTHONPATH'] = "{home}/.local/lib/python2.7/site-packages".format(home=os.environ['HOME'])
        os.environ['SMC_LOCAL_HUB_HOME'] = self.project_path
        os.environ['SMC_PROJECT_ID'] = self.project_id
        os.environ['SMC_HOST'] = 'localhost'
        os.environ['SMC'] = self.smc_path

        # for development, the raw server, jupyter, etc., have to listen on localhost since that is where
        # the hub is running
        os.environ['SMC_PROXY_HOST'] = 'localhost'

    def start(self, cores, memory, cpu_shares, base_url):
        self.remove_smc_path()   # start can be prevented by massive logs in ~/.smc; if project not stopped via stop, then they will still be there.
        self.ensure_bashrc()
        self.remove_forever_path()    # probably not needed anymore
        self.remove_snapshots_path()
        self.create_user()
        self.create_smc_path()
        self.chown(self.project_path, False) # Sometimes /projects/[project_id] doesn't have group/owner equal to that of the project.

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
                os.nice(-os.nice(0))  # Reset nice-ness to 0
                os.setgid(self.uid)
                os.setuid(self.uid)
                os.environ['HOME'] = self.project_path
                os.environ['SMC_PROJECT_ID'] = self.project_id
                os.environ['SMC'] = self.smc_path
                os.environ['USER'] = os.environ['USERNAME'] =  os.environ['LOGNAME'] = self.username
                os.environ['MAIL'] = '/var/mail/%s'%self.username
                if self._single:
                    # In single-machine mode, everything is on localhost.
                    os.environ['SMC_HOST'] = 'localhost'
                del os.environ['SUDO_COMMAND']; del os.environ['SUDO_UID']; del os.environ['SUDO_GID']; del os.environ['SUDO_USER']
                os.chdir(self.project_path)
                self.cmd("smc-start")
            finally:
                os._exit(0)
        else:
            os.waitpid(pid, 0)
            self.compute_quota(cores, memory, cpu_shares)

    def stop(self):
        self.killall()
        self.delete_user()
        self.remove_smc_path()
        self.remove_forever_path()
        self.remove_snapshots_path()

    def restart(self, cores, memory, cpu_shares, base_url):
        log = self._log("restart")
        log("first stop")
        self.stop()
        log("then start")
        self.start(cores, memory, cpu_shares, base_url)

    def get_memory(self, s):
        try:
            t = self.cmd(["smem", "-nu"], verbose=0, timeout=5).splitlines()[-1].split()[1:]
            s['memory'] = dict(zip('count swap uss pss rss'.split(),
                                   [int(x) for x in t]))
        except:
            log("error running memory command")

    def status(self, timeout=60, base_url=''):
        log = self._log("status")
        s = {}

        if (self._dev or self._single) and not os.path.exists(self.project_path): # no tiered storage
            self.create_project_path()

        s['state'] = 'opened'

        if self._dev:
            if os.path.exists(self.smc_path):
                try:
                    os.environ['HOME'] = self.project_path
                    os.environ['SMC_PROJECT_ID'] = self.project_id
                    os.environ['SMC']  = self.smc_path
                    t = os.popen("smc-status").read()
                    t = json.loads(t)
                    s.update(t)
                    if bool(t.get('local_hub.pid',False)):
                        s['state'] = 'running'
                    self.get_memory(s)
                except:
                    log("error running status command")
                    s['state'] = 'broken'
            return s

        if self._single:
            # newly created project
            if not os.path.exists(self.project_path):
                s['state'] = 'opened'
                return s

        if not os.path.exists(self.project_path):
            s['state'] = 'closed'
            return s

        if self.username not in open('/etc/passwd').read():
            return s

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
                s['state'] = 'broken'
        return s

    def state(self, timeout=60, base_url=''):
        log = self._log("state")

        if (self._dev or self._single) and not os.path.exists(self.project_path):
            # In dev or single mode, where there is no tiered storage, we always
            # create the /projects/project_id path, since that is the only place
            # the project could be.
            self.create_project_path()

        s = {}

        s['state'] = 'opened'
        if self._dev:
            if os.path.exists(self.smc_path):
                try:
                    os.environ['HOME'] = self.project_path
                    os.environ['SMC_PROJECT_ID'] = self.project_id
                    os.environ['SMC'] = self.smc_path
                    os.chdir(self.smc_path)
                    t = json.loads(os.popen("smc-status").read())
                    s.update(t)
                    if bool(t.get('local_hub.pid',False)):
                        s['state'] = 'running'
                except Exception, err:
                    log("error running status command -- %s", err)
                    s['state'] = 'broken'
            return s

        if not os.path.exists(self.project_path):  # would have to be full tiered storage mode
            s['state'] = 'closed'
            return s

        if self.username not in open('/etc/passwd').read():
            return s

        if os.path.exists(self.smc_path):
            try:
                os.setgid(self.uid)
                os.setuid(self.uid)
                os.environ['HOME'] = self.project_path
                os.environ['SMC_PROJECT_ID'] = self.project_id
                os.environ['SMC'] = self.smc_path
                os.chdir(self.smc_path)
                t = json.loads(os.popen("smc-status").read())
                s.update(t)
                if bool(t.get('local_hub.pid',False)):
                    s['state'] = 'running'
            except Exception, err:
                log("error running status command -- %s", err)
                s['state'] = 'broken'
        return s

    def _exclude(self, prefix='', extras=[]):
        return ['--exclude=%s'%os.path.join(prefix, x) for x in
                ['.sage/cache', '.sage/temp', '.trash', '.Trash',
                 '.sagemathcloud', '.smc', '.node-gyp', '.cache', '.forever',
                 '.snapshots', '*.sage-backup'] + extras]

    def directory_listing(self, path, hidden=True, time=True, start=0, limit=-1):
        """
        Return in JSON-format, listing of files in the given path.

        - path = relative path in project; *must* resolve to be
          under self._projects/project_id or get an error.
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

        # Just as in git_ls.py, we make sure that all filenames can be encoded via JSON.
        # Users sometimes make some really crazy filenames that can't be so encoded.
        # It's better to just not show them, than to show a horendous error.
        try:
            json.dumps(listdir)
        except:
            # Throw away filenames that can't be json'd, since they can't be JSON'd below,
            # which would totally lock user out of their listings.
            listdir = []
            for x in os.listdir('.'):
                try:
                    json.dumps(x)
                    listdir.append(x)
                except:
                    pass


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

        - *must* resolve to be under self._projects/project_id or get an error
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
                try:
                    os.mkdir(name, 0700)
                except OSError, e:
                    if e.errno != errno.EEXIST:
                        raise
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
                  path,                          # relative path to copy; must resolve to be under PROJECTS_PATH/project_id
                  target_hostname = 'localhost', # list of hostnames (foo or foo:port) to copy files to
                  target_project_id = "",        # project_id of destination for files; must be open on destination machine
                  target_path     = None,        # path into project; defaults to path above.
                  overwrite_newer = False,       # if True, newer files in target are copied over (otherwise, uses rsync's --update)
                  delete_missing  = False,       # if True, delete files in dest path not in source, **including** newer files
                  backup          = False,       # if True, create backup files with a tilde
                  exclude_history = False,       # if True, don't copy .sage-history files.
                  timeout         = None,
                  bwlimit         = None,
                 ):
        """
        Copy a path (directory or file) from one project to another.

        WARNING: self._projects mountpoint assumed same on target machine.
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
        target_project_path = os.path.join(self._projects, target_project_id)
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
            if self._dev:
                # In local dev mode everything is as the same account on the same machine,
                # so we just use rsync without ssh.
                w = [src_abspath, target_abspath]
            else:
                # Full mode -- different users so we use ssh between different machines.
                # However, in a cloud environment StrictHostKeyChecking is painful to manage.
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


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Project compute control script")
    subparsers = parser.add_subparsers(help='sub-command help')

    def project(args):
        kwds = {}
        for k in ['project_id', 'projects', 'single']:
            if hasattr(args, k):
                kwds[k] = getattr(args, k)
        return Project(**kwds)

    # This is a generic parser for all subcommands that operate on a collection of projects.
    # It's ugly, but it massively reduces the amount of code.
    def f(subparser):
        function = subparser.prog.split()[-1]
        def g(args):
            special = [k for k in args.__dict__.keys() if k not in ['project_id', 'func', 'dev', 'projects', 'single']]
            out = []
            errors = False
            for project_id in args.project_id:
                kwds = dict([(k,getattr(args, k)) for k in special])
                try:
                    result = getattr(Project(project_id=project_id, dev=args.dev, projects=args.projects, single=args.single), function)(**kwds)
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
                        help="insecure development mode where everything runs insecurely as the same user (no sudo)")

    parser.add_argument("--single", default=False, action="store_const", const=True,
                        help="mode where everything runs on the same machine; no storage tiers; all projects assumed opened by default.")

    parser.add_argument("--projects", help="/projects mount point [default: '/projects']",
                        dest="projects", default='/projects', type=str)

    # start project running
    parser_start = subparsers.add_parser('start', help='start project running (open and start daemon)')
    parser_start.add_argument("--cores", help="number of cores (default: 0=don't change/set) float", type=float, default=0)
    parser_start.add_argument("--memory", help="megabytes of RAM (default: 0=no change/set) int", type=int, default=0)
    parser_start.add_argument("--cpu_shares", help="relative share of cpu (default: 0=don't change/set) int", type=int, default=0)
    parser_start.add_argument("--base_url", help="passed on to local hub server so it can properly launch raw server, jupyter, etc.", type=str, default='')
    f(parser_start)

    parser_status = subparsers.add_parser('status', help='get status of servers running in the project')
    parser_status.add_argument("--timeout", help="seconds to run command", default=60, type=int)
    parser_status.add_argument("--base_url", help="ignored", type=str, default='')

    f(parser_status)

    parser_state = subparsers.add_parser('state', help='get state of project')  # {state:?}
    parser_state.add_argument("--timeout", help="seconds to run command", default=60, type=int)
    parser_state.add_argument("--base_url", help="ignored", type=str, default='')
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

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
