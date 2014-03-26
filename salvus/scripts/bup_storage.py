#!/usr/bin/env python

"""

BUP-based Project storage system

"""
import argparse, hashlib, math, os, random, shutil, string, sys, time, uuid, json, signal
from subprocess import Popen, PIPE

# The path where bup repos are stored
BUP_PATH      = os.path.abspath(os.environ.get('BUP_PATH','/tmp/bup'))

# The path where project working files appear
PROJECTS_PATH = os.path.abspath(os.environ.get('PROJECTS_PATH','/tmp/projects'))

# Default Quotas
# disk in megabytes
# memory in gigabytes
DEFAULT_QUOTA = {'disk':3000, 'inode':200000, 'memory':8, 'cpu_shares':256, 'cores':2}


SAGEMATHCLOUD_TEMPLATE = "/home/salvus/salvus/salvus/local_hub_template/"
BASHRC_TEMPLATE        = "/home/salvus/salvus/salvus/scripts/skel/.bashrc"
BASH_PROFILE_TEMPLATE  = "/home/salvus/salvus/salvus/scripts/skel/.bash_profile"

SSH_ACCESS_PUBLIC_KEY  = "/home/salvus/salvus/salvus/scripts/skel/.ssh/authorized_keys2"


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

def cmd(s, ignore_errors=False, verbose=2, timeout=None, stdout=True, stderr=True):
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


if not os.path.exists(BUP_PATH):
    cmd("mkdir -p %s; chmod og-rwx %s"%(BUP_PATH, BUP_PATH))
if not os.path.exists(PROJECTS_PATH):
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
        self.quota_path = os.path.join(self.bup_path, "quota.json")
        self.project_mnt  = os.path.join(PROJECTS_PATH, project_id)
        self.snap_mnt = os.path.join(self.project_mnt,'.bup')
        self.HEAD = "%s/HEAD"%self.bup_path
        self.branch = open(self.HEAD).read().split('/')[-1].strip() if os.path.exists(self.HEAD) else 'master'

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
        if not os.path.exists(self.project_mnt):
            self.cmd("mkdir -p %s"%self.project_mnt)
        if not os.path.exists(self.bup_path):
            self.cmd("/usr/bin/bup init")
            self.save()

    def set_branch(self, branch=''):
        if branch and branch != self.branch:
            self.branch = branch
            open(self.HEAD,'w').write("ref: refs/heads/%s"%branch)

    def checkout(self, snapshot, branch=None, use_fuse=True):
        self.set_branch(branch)
        self.create_user()
        if not os.path.exists(self.project_mnt):
            self.cmd("mkdir -p %s; /usr/bin/bup restore %s/latest/ --outdir=%s"%(self.project_mnt, self.branch, self.project_mnt))
            self.cmd("chown %s:%s -R %s"%(self.uid, self.uid, self.project_mnt))
            self.mount_snapshots()
        else:
            self.mount_snapshots()
            self.cmd("rsync -axH --delete %s/%s/%s/ %s/"%(self.snap_mnt, self.branch, snapshot, self.project_mnt))

    def umount_snapshots(self):
        self.cmd("fusermount -uz %s"%self.snap_mnt, ignore_errors=True)

    def mount_snapshots(self):
        self.umount_snapshots()
        self.cmd("rm -rf %s; mkdir -p %s; bup fuse -o --uid=%s --gid=%s %s"%(
                     self.snap_mnt, self.snap_mnt,  self.uid, self.uid, self.snap_mnt))

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
        self.delete_user()

    def save(self, path=None, timestamp=None, branch=None):
        """
        Save a snapshot.
        """
        log = self._log("save")
        self.set_branch(branch)
        if timestamp is None:
            timestamp = time.time()
        if path is None:
            path = self.project_mnt
        excludes = ['*.sage-backup', '.sage/cache', '.fontconfig', '.sage/temp', '.zfs', '.npm', '.sagemathcloud', '.node-gyp', '.cache', '.forever', '.snapshot', '.bup']
        exclude = '--exclude=' + ' --exclude='.join([os.path.join(path, e) for e in excludes])
        self.cmd("bup index -x  %s   %s"%(exclude, path))
        self.cmd("bup save --strip -n %s -d %s %s"%(self.branch, timestamp, path))
        if path == self.project_mnt:
            self.mount_snapshots()

    def tag(self, tag, delete=False):
        """
        Tag the latest commit to master or delete a tag.
        """
        if delete:
            self.cmd("bup tag -f -d %s"%tag)
        else:
            self.cmd("bup tag -f %s %s"%(tag, self.branch))

    def snapshots(self, branch=''):
        """
        Return list of all snapshots in date order of the project pool.
        """
        if not branch:
            branch = self.branch
        return self.cmd("bup ls %s/"%branch, verbose=0).split()[:-1]

    def branches(self):
        return {'branches':self.cmd("bup ls").split(), 'branch':self.branch}

    def repack(self):
        """
        repack the bup repo, replacing the large number of git pack files by a small number.

        This doesn't make any sense, given how sync works.  DON'T USE.
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
        self.cmd("rsync -axHL --delete %s/ /%s/.sagemathcloud/"%(SAGEMATHCLOUD_TEMPLATE, self.project_mnt))

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

    def quota(self, memory=None, cpu_shares=None, cores=None, disk=None, inode=None):
        log = self._log('quota')
        log("configuring quotas...")

        if os.path.exists(self.quota_path):
            try:
                quota = json.loads(open(self.quota_path).read())
                for k, v in DEFAULT_QUOTA.iteritems():
                    if k not in quota:
                        quota[k] = v
            except (ValueError, IOError), mesg:
                quota = dict(DEFAULT_QUOTA)
        else:
            quota = dict(DEFAULT_QUOTA)
        if memory is not None:
            quota['memory'] = int(memory)
        else:
            memory = quota['memory']
        if cpu_shares is not None:
            quota['cpu_shares'] = int(cpu_shares)
        else:
            cpu_shares = quota['cpu_shares']
        if cores is not None:
            quota['cores'] = float(cores)
        else:
            cores = quota['cores']
        if disk is not None:
            quota['disk'] = int(disk)
        else:
            disk = quota['disk']
        if inode is not None:
            quota['inode'] = int(inode)
        else:
            inode = quota['inode']

        try:
            s = json.dumps(quota)
            open(self.quota_path,'w').write(s)
            print s
        except IOError:
            pass

        # Disk space quota
        #    filesystem options: usrquota,grpquota; then
        #    sudo su
        #    mount -o remount /; quotacheck -vugm /dev/mapper/ubuntu--vg-root -F vfsv1; quotaon -av
        disk_soft  = int(0.8*disk * 1024)   # assuming block size of 1024 (?)
        disk_hard  = disk * 1024
        inode_soft = inode
        inode_hard = 2*inode_soft
        cmd(["setquota", '-u', self.username, str(disk_soft), str(disk_hard), str(inode_soft), str(inode_hard), '-a'])

        # Cgroups
        if cores <= 0:
            cfs_quota = -1  # no limit
        else:
            cfs_quota = int(100000*cores)

        self.cmd("cgcreate -g memory,cpu:%s"%self.username)
        open("/sys/fs/cgroup/memory/%s/memory.limit_in_bytes"%self.username,'w').write("%sG"%memory)
        open("/sys/fs/cgroup/cpu/%s/cpu.shares"%self.username,'w').write(str(cpu_shares))
        open("/sys/fs/cgroup/cpu/%s/cpu.cfs_quota_us"%self.username,'w').write(str(cfs_quota))

        z = "\n%s  cpu,memory  %s\n"%(self.username, self.username)
        cur = open("/etc/cgrules.conf").read() if os.path.exists("/etc/cgrules.conf") else ''

        if z not in cur:
            open("/etc/cgrules.conf",'a').write(z)
            self.cmd('service cgred restart')
            try:
                pids = self.cmd("ps -o pid -u %s"%self.username, ignore_errors=False).split()[1:]
                self.cmd("cgclassify %s"%(' '.join(pids)), ignore_errors=True)
                # ignore cgclassify errors, since processes come and go, etc.":
            except RuntimeError:
                # ps returns an error code if there are NO processes at all (a common condition).
                pids = []




    def sync(self, remote):
        if ':' not in remote:
            remote += ':' + self.bup_path + '/'
        if not remote.endswith('/'):
            remote += '/'
        host, remote_bup_path = remote.split(':')
        # get remote heads
        out = self.cmd("ssh -o StrictHostKeyChecking=no %s 'grep \"\" %s/refs/heads/*'"%(host, remote_bup_path), ignore_errors=True)
        if 'such file or directory' in out:
            remote_heads = []
        else:
            if 'ERROR' in out:
                raise RuntimeError(out)
            remote_heads = []
            for x in out.splitlines():
                a, b = x.split(':')[-2:]
                remote_heads.append((os.path.split(a)[-1], b))
        # sync from local to remote
        self.cmd("rsync -axH -e 'ssh -o StrictHostKeyChecking=no' %s/ %s/"%(self.bup_path, remote))
        # sync from remote back to local
        back = self.cmd("rsync -axH  -e 'ssh -o StrictHostKeyChecking=no'  %s/ %s/"%(remote, self.bup_path)).splitlines()
        if remote_heads and len([x for x in back if x.endswith('.pack')]) > 0:
            # there were remote packs possibly not available locally, so make tags that points to them,
            # so user can get their files if anything important got overwritten.
            tag = None
            for branch, id in remote_heads:
                # have we ever seen this commit?
                if id not in open("%s/logs/refs/heads/%s"%(self.bup_path,branch)).read():
                    # nope, never seen it -- tag it.
                    tag = 'conflict-%s-%s'%(branch, time.strftime("%Y-%m-%d-%H%M%S"))
                    path = os.path.join(self.bup_path, 'refs', 'tags', tag)
            if tag is not None:
                # sync back any tags
                self.cmd("rsync -axH -e 'ssh -o StrictHostKeyChecking=no' %s/ %s/"%(self.bup_path, remote))
        if os.path.exists(self.project_mnt):
            self.mount_snapshots()

    def migrate_all(self):
        self.init()
        snap_path  = "/projects/%s/.zfs/snapshot"%self.project_id
        known = set([time.mktime(time.strptime(s, "%Y-%m-%d-%H%M%S")) for s in self.snapshots()])
        for snapshot in sorted(os.listdir(snap_path)):
            tm = time.mktime(time.strptime(snapshot, "%Y-%m-%dT%H:%M:%S"))
            if tm not in known:
                self.save(path=os.path.join(snap_path, snapshot), timestamp=tm)



if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Bup-backed SMC project storage system")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser.add_argument("project_id", help="project id", type=str)

    parser.add_argument("--login_shell", help="the login shell used when creating user (default:'/bin/bash')", default="/bin/bash", type=str)

    parser_init = subparsers.add_parser('init', help='init project repo and directory')
    parser_init.set_defaults(func=lambda args: project.init())

    parser_close = subparsers.add_parser('close', help='')
    parser_close.set_defaults(func=lambda args: project.close())

    parser_checkout = subparsers.add_parser('checkout', help='checkout snapshot of project to working directory (DANGEROUS)')
    parser_checkout.add_argument("--snapshot", dest="snapshot", help="which tag or snapshot to checkout (default: latest)", type=str, default='latest')
    parser_checkout.add_argument("--branch", dest="branch", help="branch to checkout (default: whatever current branch is)", type=str, default='')
    parser_checkout.set_defaults(func=lambda args: project.checkout(snapshot=args.snapshot, branch=args.branch))

    update_daemon_code = subparsers.add_parser('update_daemon_code', help='control the ~/.sagemathcloud filesystem')
    update_daemon_code.set_defaults(func=lambda args: project.update_daemon_code())

    parser_ensure_ssh_access = subparsers.add_parser('ensure_ssh_access', help='add public key so user can ssh into the project')
    parser_ensure_ssh_access.set_defaults(func=lambda args: project.ensure_ssh_access())

    parser_quota = subparsers.add_parser('quota', help='set quota for this user; also outputs settings in JSON')
    parser_quota.add_argument("--memory", dest="memory", help="memory quota in gigabytes",
                               type=int, default=None)
    parser_quota.add_argument("--cpu_shares", dest="cpu_shares", help="shares of the cpu",
                               type=int, default=None)
    parser_quota.add_argument("--cores", dest="cores", help="max number of cores (may be float)",
                               type=float, default=None)
    parser_quota.add_argument("--disk", dest="disk", help="working disk space in gigabytes", type=int, default=None)
    parser_quota.add_argument("--inode", dest="inode", help="inode quota", type=int, default=None)
    parser_quota.set_defaults(func=lambda args: project.quota(
                    memory=args.memory, cpu_shares=args.cpu_shares, cores=args.cores, disk=args.disk, inode=args.inode))

    parser_close = subparsers.add_parser('close', help='deleting working directory')
    parser_close.set_defaults(func=lambda args: project.close())

    parser_kill = subparsers.add_parser('kill', help='Kill all processes running as this user.')
    parser_kill.set_defaults(func=lambda args: project.kill())

    parser_destroy = subparsers.add_parser('destroy', help='Delete all traces of this project from this machine.  *VERY DANGEROUS.*')
    parser_destroy.set_defaults(func=lambda args: project.destroy())

    parser_save = subparsers.add_parser('save', help='save a snapshot')
    parser_save.add_argument("--branch", dest="branch", help="save to specified branch (default: whatever current branch is); will change to that branch if different", type=str, default='')
    parser_save.set_defaults(func=lambda args: project.save(branch=args.branch))

    parser_tag = subparsers.add_parser('tag', help='tag the *latest* commit to master, or delete a tag')
    parser_tag.add_argument("tag", help="tag name", type=str)
    parser_tag.add_argument("--delete", help="delete the given tag",
                                   dest="delete", default=False, action="store_const", const=True)
    parser_tag.set_defaults(func=lambda args: project.tag(tag=args.tag, delete=args.delete))

    parser_sync = subparsers.add_parser('sync', help='sync with a remote bup repo')
    parser_sync.add_argument("remote", help="hostname[:path], where path defaults to same path as locally", type=str)
    parser_sync.set_defaults(func=lambda args: project.sync(args.remote))

    parser_migrate_all = subparsers.add_parser('migrate_all', help='migrate all snapshots of project')
    parser_migrate_all.set_defaults(func=lambda args: project.migrate_all())

    parser_snapshots = subparsers.add_parser('snapshots', help='output JSON list of snapshots of current branch')
    parser_snapshots.add_argument("--branch", dest="branch", help="show for given branch (by default the current one)", type=str, default='')
    parser_snapshots.set_defaults(func=lambda args: print_json(project.snapshots(branch=args.branch)))

    parser_branches = subparsers.add_parser('branches', help='output JSON {branches:[list of branches], branch:"name"}')
    parser_branches.set_defaults(func=lambda args: print_json(project.branches()))


    args = parser.parse_args()


    t0 = time.time()
    project = Project(project_id  = args.project_id,
                      login_shell = args.login_shell)
    args.func(args)
    log("total time: %s seconds"%(time.time()-t0))

