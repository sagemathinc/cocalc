#!/usr/bin/env python

"""



"""

# Temporary...

BUP_PATH='/tmp/bup'
PROJECTS_PATH='/tmp/projects'

# Default amount of disk space
DEFAULT_QUOTA      = '5G'

# Default cap on amount of RAM in Gigbaytes
DEFAULT_MEMORY_G   = 8

# Default share of the CPU
DEFAULT_CPU_SHARES = 256

# Cap on number of simultaneous cores
DEFAULT_CORE_QUOTA = 2   # -1=no limit; 2 = up to two cores

SAGEMATHCLOUD_TEMPLATE = "/home/salvus/salvus/salvus/local_hub_template/"
BASHRC_TEMPLATE        = "/home/salvus/salvus/salvus/scripts/skel/.bashrc"
BASH_PROFILE_TEMPLATE  = "/home/salvus/salvus/salvus/scripts/skel/.bash_profile"

SSH_ACCESS_PUBLIC_KEY  = "/home/salvus/salvus/salvus/scripts/skel/.ssh/authorized_keys2"

import argparse, hashlib, math, os, random, shutil, string, sys, time, uuid, json, signal
from subprocess import Popen, PIPE

def print_json(s):
    print json.dumps(s, separators=(',',':'))

def uid(project_id):
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    # 2^31-1=max uid which works with FUSE and node (and Linux, which goes up to 2^32-2).
    n = int(hashlib.sha512(project_id).hexdigest()[:8], 16)
    return n if n>1000 else n+1000

def now():
    return time.strftime('%Y-%m-%dT%H:%M:%S')

def log(m):
    sys.stderr.write(str(m)+'\n')
    sys.stderr.flush()

def ensure_file_exists(src, target):
    if not os.path.exists(target):
        shutil.copyfile(src, target)
        s = os.stat(os.path.split(target)[0])
        os.chown(target, s.st_uid, s.st_gid)

def cmd(s, ignore_errors=False, verbose=2, timeout=None):
    if verbose >= 1:
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
            log("(%s seconds): %s"%(time.time()-t, x))
        elif verbose >= 1:
            log("(%s seconds)"%(time.time()-t))
        return x.strip()
    except IOError:
        return mesg
    finally:
        if timeout:
            signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm


cmd("mkdir -p %s; chmod og-rwx %s"%(BUP_PATH, BUP_PATH))
cmd("mkdir -p %s; chmod og+rx %s"%(PROJECTS_PATH, PROJECTS_PATH))


class Project(object):
    def __init__(self, project_id, login_shell='/bin/bash'):
        if uuid.UUID(project_id).get_version() != 4:
            raise RuntimeError("invalid project uuid='%s'"%project_id)
        self.project_id = project_id
        self.uid = uid(project_id)
        self.username = self.project_id.replace('-','')
        self.login_shell = login_shell
        self.bup_path = os.path.join(BUP_PATH, project_id)
        self.project_mnt  = os.path.join(PROJECTS_PATH, project_id)
        self.snap_mnt = os.path.join(self.project_mnt,'.snapshot')

    def cmd(self, *args, **kwds):
        os.environ['BUP_DIR'] = self.bup_path
        return cmd(*args, **kwds)

    def __repr__(self):
        return "Project(%s)"%project_id

    def _log(self, funcname, **kwds):
        def f(mesg=''):
            log("%s(project_id=%s,%s): %s"%(funcname, self.project_id, kwds, mesg))
        f()
        return f

    def create_user(self):
        u = self.uid
        self.cmd('/usr/sbin/groupadd -g %s -o %s'%(u, self.username), ignore_errors=True)
        self.cmd('/usr/sbin/useradd -u %s -g %s -o %s -d %s -s %s'%(u,u, self.username, self.project_mnt, self.login_shell), ignore_errors=True)

    def delete_user(self):
        u = self.uid
        self.cmd('/usr/sbin/userdel %s; sudo /usr/sbin/groupdel %s'%(self.username, self.username), ignore_errors=True)

    def init(self):
        """
        Create user home directory and corresponding bup repo.
        """
        log = self._log("create")
        if not os.path.exists(self.bup_path):
            self.cmd("/usr/bin/bup init")
        if not os.path.exists(self.project_mnt):
            self.cmd("mkdir -p %s; chown %s:%s -R %s"%(self.project_mnt, self.uid, self.uid, self.project_mnt))

    def open(self, quota=DEFAULT_QUOTA):
        """
        Check the most recent snapshot to the user home directory.
        """
        log = self._log("checkout")
        self.create_user()
        self.cmd("/usr/bin/bup restore master/latest/ --outdir=%s"%self.project_mnt)
        self.cmd("chown %s:%s -R %s"%(self.uid, self.uid, self.project_mnt))
        self.mount_snapshots()

    def umount_snapshots(self):
        self.cmd("fusermount -uz %s"%self.snap_mnt, ignore_errors=True)

    def mount_snapshots(self):
        self.umount_snapshots()
        self.cmd("rm -rf %s; mkdir -p %s; bup fuse -o %s"%(
                     self.snap_mnt, self.snap_mnt,  self.snap_mnt))

    def kill(self, grace_s=0.25):
        log("killing all processes by user with id %s"%self.uid)
        MAX_TRIES=10
        for i in range(MAX_TRIES):
            self.cmd("/usr/bin/pkill -u %s; sleep %s; /usr/bin/pkill -9 -u %s"%(self.uid, grace_s, self.uid), ignore_errors=True)
            n = self.num_procs()
            log("kill attempt left %s procs"%n)
            if n == 0:
                break

    def pids(self):
        return [int(x) for x in cmd("pgrep -u %s"%self.uid, ignore_errors=True).replace('ERROR','').split()]

    def num_procs(self):
        return len(self.pids())

    def close(self):
        """
        Remove the user's files, leaving only the bup repo.
        DANGEROUS.
        """
        log = self._log("remove")
        log("removing users files")
        self.kill()
        self.umount_snapshots()
        shutil.rmtree(self.project_mnt)

    def save(self, path=None, timestamp=None, remount=True):
        """
        Save a snapshot.
        """
        log = self._log("save")
        if timestamp is None:
            timestamp = time.time()
        if path is None:
            path = self.project_mnt
        excludes = ['*.sage-backup', '.sage/cache', '.fontconfig', '.sage/temp', '.zfs', '.npm', '.sagemathcloud', '.node-gyp', '.cache', '.forever', '.snapshot']
        exclude = '--exclude=' + ' --exclude='.join([os.path.join(path, e) for e in excludes])
        self.cmd("bup index -x  %s   %s"%(exclude, path))
        self.cmd("bup save --strip -n master -d %s %s"%(timestamp, path))
        if remount:
            self.mount_snapshots()

    def snapshots(self):
        """
        Return list of all snapshots in date order of the project pool.
        """
        return self.cmd("bup ls master/", verbose=0).split()[:-1]

    def increase_quota(self, amount):
        """
        Increase the quota of the project by the given amount.
        """
        raise NotImplementedError

    def repack(self):
        """
        repack the bup repo, replacing the large number of git pack files by a small number.
        """
        self.cmd("cd %s; git repack -lad"%self.bup_path)

    def destroy(self):
        """
        Delete all traces of this project from this machine.  *VERY DANGEROUS.*
        """
        self.close()
        shutil.rmtree(self.bup_path)

    def update_daemon_code(self):
        log = self._log('update_daemon_code')
        cmd("rsync -axHL --delete %s/ /%s/.sagemathcloud/"%(SAGEMATHCLOUD_TEMPLATE, self.project_mnt))

    def ensure_ssh_access(self):
        log = self._log('ensure_ssh_access')
        log("now make sure .ssh/authorized_keys file good")
        ensure_file_exists(BASHRC_TEMPLATE, os.path.join(self.project_mnt,".bashrc"))
        ensure_file_exists(BASHRC_PROFILE_TEMPLATE, os.path.join(self.project_mnt,".bash_profile"))

        dot_ssh = os.path.join(self.project_mnt, '.ssh')
        if os.path.exists(dot_ssh) and not os.path.isdir(dot_ssh):
            os.unlink(dot_ssh)
        if not os.path.exists(dot_ssh):
            os.makedirs(dot_ssh)
        target = os.path.join(dot_ssh, 'authorized_keys')
        authorized_keys = '\n' + open(SSH_ACCESS_PUBLIC_KEY).read() + '\n'

        if not os.path.exists(target) or authorized_keys not in open(target).read():
            open(target,'w').write(authorized_keys)
        self.cmd('chown -R %s:%s %s'%(self.uid, self.uid, dot_ssh))
        self.cmd('chmod og-rwx -R %s'%dot_ssh)

    def cgroup(self, memory_G, cpu_shares, core_quota):
        log = self._log('cgroup')
        log("configuring cgroups...")
        if core_quota <= 0:
            cfs_quota = -1
        else:
            cfs_quota = int(100000*core_quota)

        cmd("cgcreate -g memory,cpu:%s"%self.username)
        open("/sys/fs/cgroup/memory/%s/memory.limit_in_bytes"%self.username,'w').write("%sG"%memory_G)
        open("/sys/fs/cgroup/cpu/%s/cpu.shares"%self.username,'w').write(cpu_shares)
        open("/sys/fs/cgroup/cpu/%s/cpu.cfs_quota_us"%self.username,'w').write(cfs_quota)

        z = "\n%s  cpu,memory  %s\n"%(self.username, self.username)
        cur = open("/etc/cgrules.conf").read()

        if z not in cur:
            open("/etc/cgrules.conf",'a').write(z)
            cmd('service cgred restart')

            try:
                pids = cmd("ps -o pid -u %s"%self.username, ignore_errors=False).split()[1:]
                cmd("cgclassify %s"%(' '.join(pids)), ignore_errors=True)
                # ignore cgclassify errors, since processes come and go, etc.n__":
            except RuntimeError:
                # ps returns an error code if there are NO processes at all (a common condition).
                pids = []

    def migrate(self):
        self.init()
        snap_path  = "/projects/%s/.zfs/snapshot"%self.project_id
        snapshots = os.listdir(snap_path)
        snapshots.sort()
        if len(snapshots) == 0:
            timestamp = time.time() # now
        else:
            timestamp = time.mktime(time.strptime(snapshots[-1], "%Y-%m-%dT%H:%M:%S"))

        self.save(path='/projects/%s'%self.project_id, timestamp=timestamp, remount=False)



if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Bup-backed SMC project storage system")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser.add_argument("project_id", help="project id", type=str)

    parser.add_argument("--login_shell", help="the login shell used when creating user (default:'/bin/bash')", default="/bin/bash", type=str)

    parser_init = subparsers.add_parser('init', help='init project repo and directory')
    parser_init.set_defaults(func=lambda args: project.init())

    parser_close = subparsers.add_parser('close', help='')
    parser_close.set_defaults(func=lambda args: project.close())

    parser_open = subparsers.add_parser('open', help='')
    parser_open.add_argument("--quota", dest="quota", help="disk quota (default: '%s')"%DEFAULT_QUOTA, type=str, default=DEFAULT_QUOTA)
    parser_open.set_defaults(func=lambda args: project.open(quota=args.quota))


    update_daemon_code = subparsers.add_parser('update_daemon_code', help='control the ~/.sagemathcloud filesystem')
    update_daemon_code.set_defaults(func=lambda args: project.update_daemon_code())

    parser_ensure_ssh_access = subparsers.add_parser('ensure_ssh_access', help='add public key so user can ssh into the project')
    parser_ensure_ssh_access.set_defaults(func=lambda args: project.ensure_ssh_access())

    parser_cgroup = subparsers.add_parser('cgroup', help='configure cgroup for this user')
    parser_cgroup.add_argument("--memory_G", dest="memory_G", help="memory quota in gigabytes (default: '%s')"%DEFAULT_MEMORY_G,
                               type=int, default=DEFAULT_MEMORY_G)
    parser_cgroup.add_argument("--cpu_shares", dest="cpu_shares", help="share of the cpu (default: '%s')"%DEFAULT_CPU_SHARES,
                               type=int, default=DEFAULT_CPU_SHARES)
    parser_cgroup.add_argument("--core_quota", dest="core_quota", help="max number of cores -- can be float (default: '%s')"%DEFAULT_CORE_QUOTA,
                               type=float, default=DEFAULT_CORE_QUOTA)
    parser_cgroup.set_defaults(func=lambda args: project.cgroup(
                    memory_G=args.memory_G, cpu_shares=args.cpu_shares, core_quota=args.core_quota))

    parser_close = subparsers.add_parser('close', help='deleting working directory')
    parser_close.set_defaults(func=lambda args: project.close())

    parser_kill = subparsers.add_parser('kill', help='Kill all processes running as this user.')
    parser_kill.set_defaults(func=lambda args: project.kill())

    parser_destroy = subparsers.add_parser('destroy', help='Delete all traces of this project from this machine.  *VERY DANGEROUS.*')
    parser_destroy.set_defaults(func=lambda args: project.destroy())

    parser_repack = subparsers.add_parser('repack', help='repack the bup repo, reducing the number of distinct pack files')
    parser_repack.set_defaults(func=lambda args: project.repack())

    parser_save = subparsers.add_parser('save', help='save a snapshot')
    parser_save.set_defaults(func=lambda args: project.save())

    parser_migrate = subparsers.add_parser('migrate', help='migrate a project')
    parser_migrate.set_defaults(func=lambda args: project.migrate())

    parser_snapshots = subparsers.add_parser('snapshots', help='show list of snapshots of the given project pool (JSON)')
    parser_snapshots.set_defaults(func=lambda args: print_json(project.snapshots()))

    parser_increase_quota = subparsers.add_parser('increase_quota', help='increase quota')
    parser_increase_quota.add_argument("--amount", dest="amount", help="amount (default: '5G')", type=str, default='5G')
    parser_increase_quota.set_defaults(func=lambda args: project.increase_quota(amount=args.amount))

    args = parser.parse_args()


    t0 = time.time()
    project = Project(project_id  = args.project_id,
                      login_shell = args.login_shell)
    args.func(args)
    log("total time: %s seconds"%(time.time()-t0))

