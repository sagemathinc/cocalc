#!/usr/bin/env python

"""

BUP-based Project storage system

"""
# If UNSAFE_MODE=False, we only provide a restricted subset of options.  When this
# script will be run via sudo, it is useful to minimize what it is able to do, e.g.,
# there is no reason it should have easy command-line options to overwrite any file
# on the system with arbitrary content.
UNSAFE_MODE=False

import argparse, hashlib, math, os, random, shutil, socket, string, sys, time, uuid, json, signal, math
from subprocess import Popen, PIPE
from uuid import UUID, uuid4

# If using ZFS:
ZPOOL = 'storage'  # must have ZPOOL/bups and ZPOOL/projects filesystems

# The path where bup repos are stored
BUP_PATH      = '/storage/bups'

# The path where bup repos are stored
CONF_PATH      = '/storage/conf'

# The path where project working files appear
PROJECTS_PATH = '/projects'


# Default account settings

DEFAULT_ACCOUNT_SETTINGS = {
    'disk'       : 3000,     # disk in megabytes
    'inode'      : 200000,   # not used with ZFS
    'memory'     : 8,        # memory in gigabytes
    'cpu_shares' : 256,
    'cores'      : 2
    'login_shell': '/bin/bash'
}

FILESYSTEM = 'zfs'   # 'zfs' or 'ext4'

if FILESYSTEM == 'ext4':
    if not os.path.exists(BUP_PATH):
        cmd("/bin/mkdir -p %s; chmod og-rwx %s"%(BUP_PATH, BUP_PATH))

    if not os.path.exists(PROJECTS_PATH):
        cmd("/bin/mkdir -p %s; chmod og+rx %s"%(PROJECTS_PATH, PROJECTS_PATH))


# Make sure to copy: 'cp -rv ~/salvus/salvus/scripts/skel/.sagemathcloud/data /home/salvus/salvus/salvus/local_hub_template/"
SAGEMATHCLOUD_TEMPLATE = "/home/salvus/salvus/salvus/local_hub_template/"

BASHRC_TEMPLATE        = "/home/salvus/salvus/salvus/scripts/skel/.bashrc"
BASH_PROFILE_TEMPLATE  = "/home/salvus/salvus/salvus/scripts/skel/.bash_profile"

SSH_ACCESS_PUBLIC_KEY  = "/home/salvus/salvus/salvus/scripts/skel/.ssh/authorized_keys2"

def log(m):
    sys.stderr.write(str(m)+'\n')
    sys.stderr.flush()

# init SERVER_ID
path = os.path.join(CONF_PATH, 'server_id')
if not os.path.exists(path):
    SERVER_ID=str(uuid4())
    open(path,'w').write(SERVER_ID)
else:
    SERVER_ID=open(path).read()

# init list of known other servers
path = os.path.join(CONF_PATH, 'servers.json')
if not os.path.exists(path):
    SERVERS = {SERVER_ID:{'hostname':socket.gethostname()}}
    open(path,'w').write(json.dumps(SERVERS))
else:
    try:
        SERVERS = json.loads(open(path).read())
    except Exception, msg:
        log(msg)  # reset in case of corruption
        SERVERS = {SERVER_ID:{'hostname':socket.gethostname()}}
        open(path,'w').write(json.dumps(SERVERS))


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

def ensure_file_exists(src, target):
    if not os.path.exists(target):
        shutil.copyfile(src, target)
        s = os.stat(os.path.split(target)[0])
        os.chown(target, s.st_uid, s.st_gid)

def check_uuid(uuid):
    if UUID(uuid).version != 4:
        raise RuntimeError("invalid uuid")


def cmd(s, ignore_errors=False, verbose=2, timeout=None, stdout=True, stderr=True):
    s = [str(x) for x in s]
    if verbose >= 1:
        if isinstance(s, list):
            log(' '.join(s))
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
            log("(%s seconds): %s"%(time.time()-t, x))
        elif verbose >= 1:
            log("(%s seconds)"%(time.time()-t))
        return x.strip()
    except IOError:
        return mesg
    finally:
        if timeout:
            signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm

class Project(object):
    def __init__(self, project_id):
        if uuid.UUID(project_id).get_version() != 4:
            raise RuntimeError("invalid project uuid='%s'"%project_id)
        self.project_id            = project_id
        self.uid                   = uid(project_id)
        self.gid                   = self.uid
        self.username              = self.project_id.replace('-','')
        self.bup_path              = os.path.join(BUP_PATH, project_id)
        self.conf_path             = os.path.join(self.bup_path, "conf")
        self.account_settings_path = os.path.join(self.conf_path, "account-settings.json")
        self.replicas_path         = os.path.join(self.conf_path, "replicas.json")
        self.project_mnt           = os.path.join(PROJECTS_PATH, project_id)
        self.snap_mnt              = os.path.join(self.project_mnt,'.bup')
        self.HEAD                  = "%s/HEAD"%self.bup_path
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
        login_shell = get_account_settings()['login_shell']
        if self.gid != self.uid:
            self.cmd(['/usr/sbin/groupadd', '-g', self.gid, '-o', self.username], ignore_errors=True)
        self.cmd(['/usr/sbin/useradd', '-u', self.uid, '-g', self.gid, '-o', self.username,
                  '-d', self.project_mnt, '-s', login_shell], ignore_errors=True)

    def delete_user(self):
        self.cmd(['/usr/sbin/userdel', self.username], ignore_errors=True)
        if self.gid != self.uid:
            self.cmd(['/usr/sbin/groupdel', self.username], ignore_errors=True)

    def start_daemons(self):
        self.cmd(['su', '-', self.username, '-c', 'cd .sagemathcloud; . sagemathcloud-env; ./start_smc'], timeout=30)

    def start(self):
        self.delete_user()
        self.create_user()
        self.setup_account()
        self.ensure_conf_files()
        self.ensure_ssh_access()
        self.update_daemon_code()
        self.start_daemons()
        self.mount_snapshots()

    def init(self):
        """
        Create user home directory and corresponding bup repo.
        """
        log = self._log("create")
        if not os.path.exists(self.project_mnt):
            self.makedirs(self.project_mnt)
        os.chown(self.project_mnt, self.uid, self.gid)
        if not os.path.exists(self.bup_path):
            self.cmd(['/usr/bin/bup', 'init'])
            self.save()

    def set_branch(self, branch=''):
        if branch and branch != self.branch:
            self.branch = branch
            open(self.HEAD,'w').write("ref: refs/heads/%s"%branch)

    def checkout(self, snapshot='latest', branch=None):
        self.set_branch(branch)
        if not os.path.exists(self.project_mnt):
            self.makedirs(self.project_mnt)
            self.cmd(['/usr/bin/bup', 'restore', '%s/%s/'%(self.branch, snapshot), '--outdir', self.project_mnt])
            self.chown(self.project_mnt)
            self.mount_snapshots()
        else:
            self.mount_snapshots()
            self.cmd(['rsync', '-axH', '--delete', self.rsync_exclude(),
                      os.path.join(self.snap_mnt, self.branch, snapshot)+'/',
                      self.project_mnt+'/'])

    def umount_snapshots(self):
        self.cmd(['fusermount', '-uz', self.snap_mnt], ignore_errors=True)

    def mount_snapshots(self):
        self.umount_snapshots()
        if os.path.exists(self.snap_mnt):
            os.rmdir(self.snap_mnt)
        self.makedirs(self.snap_mnt)
        self.cmd(['bup', 'fuse', '-o', '--uid', self.uid, '--gid', self.gid, self.snap_mnt])

    def kill(self, grace_s=0.5):
        log("killing all processes by user with id %s"%self.uid)
        MAX_TRIES=10
        # we use both kill and pkill -- pkill seems better in theory, but I've definitely seen it get ignored.
        for i in range(MAX_TRIES):
            self.cmd(['/usr/bin/killall', '-u', self.username], ignore_errors=True)
            self.cmd(['/usr/bin/pkill', '-u', self.uid], ignore_errors=True)
            time.sleep(grace_s)
            self.cmd(['/usr/bin/killall', '-9', '-u', self.username], ignore_errors=True)
            self.cmd(['/usr/bin/pkill', '-9', '-u', self.uid], ignore_errors=True)
            n = self.num_procs()
            log("kill attempt left %s procs"%n)
            if n == 0:
                break

    def pids(self):
        return [int(x) for x in cmd(['pgrep', '-u', self.uid], ignore_errors=True).replace('ERROR','').split()]

    def num_procs(self):
        return len(self.pids())

    def archive(self):
        """
        Remove the user's files, leaving only the bup repo.

        ** DANGEROUS. **

        This would be used when it is highly unlikely the project will ever be used again, e.g.,
        maybe when one deletes a project, and we want to keep it around for a while for archival
        purposes, just in case.
        """
        log = self._log("archive")
        self.kill()
        self.umount_snapshots()
        log("removing users files")
        shutil.rmtree(self.project_mnt)
        self.delete_user()

    def destroy(self):
        """
        *VERY DANGEROUS.*  Delete all traces of this project from this machine.
        """
        self.archive()
        shutil.rmtree(self.bup_path)

    def rsync_exclude(self, path=None):
        if path is None:
            path = self.project_mnt
        excludes = ['*.sage-backup', '.sage/cache', '.fontconfig', '.sage/temp', '.zfs', '.npm', '.sagemathcloud', '.node-gyp', '.cache', '.forever', '.snapshot', '.bup']
        return '--exclude=' + ' --exclude='.join(excludes)

    def save(self, path=None, timestamp=None, branch=None):
        """
        Save a snapshot.
        """
        log = self._log("save")
        self.set_branch(branch)
        if path is None:
            path = self.project_mnt
        self.cmd(["/usr/bin/bup", "index", "-x", self.rsync_exclude(path), path])
        if timestamp is None:
            timestamp = time.time()
        self.cmd(["/usr/bin/bup", "save", "--strip", "-n", self.branch, '-d', timestamp, path])
        if path == self.project_mnt:
            self.mount_snapshots()

    def tag(self, tag, delete=False):
        """
        Tag the latest commit to master or delete a tag.
        """
        if delete:
            self.cmd(["/usr/bin/bup", "tag", "-f", "-d", tag])
        else:
            self.cmd(["/usr/bin/bup", "tag", "-f", tag, self.branch])

    def snapshots(self, branch=''):
        """
        Return list of all snapshots in date order of the project pool.
        """
        if not branch:
            branch = self.branch
        return self.cmd(["/usr/bin/bup", "ls", branch+'/'], verbose=0).split()[:-1]

    def branches(self):
        return {'branches':self.cmd("bup ls").split(), 'branch':self.branch}

    def repack(self):
        """
        repack the bup repo, replacing the large number of git pack files by a small number.

        This doesn't make any sense, given how sync works.  DON'T USE.
        """
        self.cmd("cd %s; git repack -lad"%self.bup_path)


    def makedirs(self, path):
        log = self._log('makedirs')
        if os.path.exists(path) and not os.path.isdir(path):
            log("removing %s"%path)
            os.unlink(path)
        if not os.path.exists(path):
            log("creating %s"%path)
            os.makedirs(path, mode=0700)
        os.chown(path, self.uid, self.gid)

    def update_daemon_code(self):
        log = self._log('update_daemon_code')
        target = '/%s/.sagemathcloud/'%self.project_mnt
        self.makedirs(target)
        self.cmd(["rsync", "-axHL", "--update", SAGEMATHCLOUD_TEMPLATE+"/", target])
        self.chown(target)

    def chown(self, path):
        self.cmd(["chown", "%s:%s"%(self.uid, self.gid), '-R', path])

    def ensure_file_exists(self, src, target):
        target = os.path.abspath(target)
        if not os.path.exists(target):
            self.makedirs(os.path.split(target)[0])
            shutil.copyfile(src, target)
            os.chown(target, self.uid, self.gid)

    def ensure_conf_files(self):
        log = self._log('ensure_conf_files')
        log("ensure there is a bashrc and bash_profile")
        self.ensure_file_exists(BASHRC_TEMPLATE, os.path.join(self.project_mnt,".bashrc"))
        self.ensure_file_exists(BASH_PROFILE_TEMPLATE, os.path.join(self.project_mnt,".bash_profile"))

    def ensure_ssh_access(self):
        log = self._log('ensure_ssh_access')
        log("make sure .ssh/authorized_keys file good")
        dot_ssh = os.path.join(self.project_mnt, '.ssh')
        self.makedirs(dot_ssh)
        target = os.path.join(dot_ssh, 'authorized_keys')
        authorized_keys = '\n' + open(SSH_ACCESS_PUBLIC_KEY).read() + '\n'

        if not os.path.exists(target) or authorized_keys not in open(target).read():
            log("writing authorized_keys files")
            open(target,'w').write(authorized_keys)
        else:
            log("%s already exists and is good"%target)
        self.cmd(['chown', '-R', '%s:%s'%(self.uid, self.gid), dot_ssh])
        self.cmd(['chmod', 'og-rwx', '-R', dot_ssh])

    def get_account_settings(self):
        if not os.path.exists(self.conf_path):
            os.makedirs(self.conf_path)
        if os.path.exists(self.account_path):
            try:
                account_settings = json.loads(open(self.account_settings_path).read())
                for k, v in DEFAULT_ACCOUNT_SETTINGS.iteritems():
                    if k not in account_settings:
                        account_settings[k] = v
            except (ValueError, IOError), mesg:
                account_settings = dict(DEFAULT_ACCOUNT_SETTINGS)
        else:
            account_settings = dict(DEFAULT_ACCOUNT_SETTINGS)
        return account_settings


    def setup_account(self, memory=None, cpu_shares=None, cores=None, disk=None, inode=None, login_shell=None):
        log = self._log('setup account')
        log("configuring account...")

        account_settings = self.get_account_settings()

        if memory is not None:
            account_settings['memory'] = int(memory)
        else:
            memory = account_settings['memory']
        if cpu_shares is not None:
            account_settings['cpu_shares'] = int(cpu_shares)
        else:
            cpu_shares = account_settings['cpu_shares']
        if cores is not None:
            account_settings['cores'] = float(cores)
        else:
            cores = account_settings['cores']
        if disk is not None:
            account_settings['disk'] = int(disk)
        else:
            disk = account_settings['disk']
        if inode is not None:
            account_settings['inode'] = int(inode)
        else:
            inode = account_settings['inode']
        if login_shell is not None and os.path.exists(login_shell):
            account_settings['login_shell'] = login_shell
        else:
            login_shell = account_settings['login_shell']

        try:
            s = json.dumps(account_settings)
            open(self.account_settings_path,'w').write(s)
            print s
        except IOError:
            pass

        # Disk space quota

        if FILESYSTEM == 'zfs':
            """
            zpool create -f storage /dev/sdc
            zfs create storage/projects
            zfs set mountpoint=/projects storage/projects
            zfs set dedup=on storage/projects
            zfs set compression=lz4 storage/projects
            zfs mount storage/projects
            zfs create storage/bups
            zfs set mountpoint=/storage/bups storage/bups
            chmod og-rwx /storage/bups
            zfs create storage/conf
            zfs set mountpoint=/storage/conf storage/conf
            chmod og-rwx /storage/conf
            """
            cmd(['zfs', 'set', 'userquota@%s=%sM'%(self.username, disk), '%s/projects'%ZPOOL])

        elif FILESYSTEM == 'ext4':

            #    filesystem options: usrquota,grpquota; then
            #    sudo su
            #    mount -o remount /; quotacheck -vugm /dev/mapper/ubuntu--vg-root -F vfsv1; quotaon -av
            disk_soft  = int(0.8*disk * 1024)   # assuming block size of 1024 (?)
            disk_hard  = disk * 1024
            inode_soft = inode
            inode_hard = 2*inode_soft
            cmd(["setquota", '-u', self.username, str(disk_soft), str(disk_hard), str(inode_soft), str(inode_hard), '-a'])

        else:
            raise RuntimeError("unknown FILESYSTEM='%s'"%FILESYSTEM)


        # Cgroups
        if cores <= 0:
            cfs_quota = -1  # no limit
        else:
            cfs_quota = int(100000*cores)

        self.cmd(["cgcreate", "-g", "memory,cpu:%s"%self.username])
        open("/sys/fs/cgroup/memory/%s/memory.limit_in_bytes"%self.username,'w').write("%sG"%memory)
        open("/sys/fs/cgroup/cpu/%s/cpu.shares"%self.username,'w').write(str(cpu_shares))
        open("/sys/fs/cgroup/cpu/%s/cpu.cfs_quota_us"%self.username,'w').write(str(cfs_quota))

        z = "\n%s  cpu,memory  %s\n"%(self.username, self.username)
        cur = open("/etc/cgrules.conf").read() if os.path.exists("/etc/cgrules.conf") else ''

        if z not in cur:
            open("/etc/cgrules.conf",'a').write(z)
            try:
                self.cmd(['service', 'cgred', 'restart'])
            except RuntimeError:
                raise RuntimeError("cgroup quota service not supported")
            try:
                pids = self.cmd("ps -o pid -u %s"%self.username, ignore_errors=False).split()[1:]
                self.cmd(["cgclassify"] + pids, ignore_errors=True)
                # ignore cgclassify errors, since processes come and go, etc.":
            except RuntimeError:
                # ps returns an error code if there are NO processes at all (a common condition).
                pids = []

    def replicas(self, add='', remove=''):
        log = self._log('replicas')
        log("configuring replicas...")
        if not os.path.exists(self.conf_path):
            os.makedirs(self.conf_path)
        if os.path.exists(self.replicas_path):
            try:
                replicas = json.loads(open(self.replicas_path).read())
            except (ValueError, IOError), mesg:
                replicas = []
        else:
            replicas = []
        if add:
            for host_id in add.split(','):
                if host_id not in replicas:
                    replicas.append(host_id)
        if remove:
            for host_id in remove.split(','):
                if host_id in replicas:
                    replicas.remove(host_id)
        open(self.replicas_path,'w').write(json.dumps(replicas))
        return replicas

    def sync(self, destructive=False):
        status = {}
        for server_id in self.replicas():
            if server_id != SERVER_ID:
                s = status[server_id] = {'server_id':server_id}
                t = time.time()
                try:
                    self._sync(server_id)
                except Exception, err:
                    s['error'] = str(err)
                s['time'] = time.time() - t
        print json.dumps(status)

    def _sync(self, server_id, destructive=False):
        """

        If destructive is true, simply push from local to remote, overwriting anything that is remote.
        If destructive is false, pushes, then pulls, and makes a tag pointing at conflicts.
        """
        log = self._log('sync')
        log("syncing...")

        if server_id not in SERVERS:
            raise RuntimeError("unknown server %s"%server_id)

        remote = SERVERS[server_id]['hostname']

        remote_bup_path = os.path.join(BUP_PATH, self.project_id)

        if os.path.exists(self.project_mnt):
            # set remote disk quota, so rsync doesn't fail due to missing space.
            if FILESYSTEM == 'zfs':
                self.cmd(["ssh", "-o", "StrictHostKeyChecking=no", remote,
                          'zfs set userquota@%s=%sM %s/projects'%(
                                            self.uid, self.get_account_settings()['disk'], ZPOOL)])
            else:
                raise NotImplementedError

            self.cmd(["rsync", "-axH", "--delete", self.rsync_exclude(),
                      '-e', 'ssh -o StrictHostKeyChecking=no',
                      self.project_mnt+'/', "%s:%s/"%(remote, self.project_mnt)])

        if destructive:
            log("push so that remote=local: easier; have to do this after a recompact (say)")
            self.cmd(["rsync", "-axH", "--delete", "-e", 'ssh -o StrictHostKeyChecking=no',
                      self.bup_path+'/', remote+'/'])
            return

        log("get remote heads")
        out = self.cmd(["ssh", "-o", "StrictHostKeyChecking=no", remote,
                        'grep -H \"\" %s/refs/heads/*'%remote_bup_path], ignore_errors=True)
        if 'such file or directory' in out:
            remote_heads = []
        else:
            if 'ERROR' in out:
                raise RuntimeError(out)
            remote_heads = []
            for x in out.splitlines():
                a, b = x.split(':')[-2:]
                remote_heads.append((os.path.split(a)[-1], b))
        log("sync from local to remote")
        self.cmd(["rsync", "-axH", "-e", 'ssh -o StrictHostKeyChecking=no',
                  self.bup_path + '/', "%s:%s/"%(remote, remote_bup_path)])
        log("sync from remote back to local")
        # the -v is important below!
        back = self.cmd(["rsync", "-vaxH", "-e", 'ssh -o StrictHostKeyChecking=no',
                         "%s:%s/"%(remote, remote_bup_path), self.bup_path + "/"]).splitlines()
        if remote_heads and len([x for x in back if x.endswith('.pack')]) > 0:
            log("there were remote packs possibly not available locally, so make tags that points to them")
            # so user can get their files if anything important got overwritten.
            tag = None
            for branch, id in remote_heads:
                # have we ever seen this commit?
                c = "%s/logs/refs/heads/%s"%(self.bup_path,branch)
                if not os.path.exists(c) or id not in open(c).read():
                    log("nope, never seen %s -- tag it."%branch)
                    tag = 'conflict-%s-%s'%(branch, time.strftime("%Y-%m-%d-%H%M%S"))
                    path = os.path.join(self.bup_path, 'refs', 'tags', tag)
                    open(path,'w').write(id)
            if tag is not None:
                log("sync back any tags")
                self.cmd(["rsync", "-axH", "-e", 'ssh -o StrictHostKeyChecking=no', self.bup_path+'/', remote+'/'])
        if os.path.exists(self.project_mnt):
            log("mount snapshots")
            self.mount_snapshots()

    def migrate_all(self, max_snaps=400):
        log = self._log('migrate_all')
        log("determining snapshots...")
        self.init()
        snap_path  = "/projects/%s/.zfs/snapshot"%self.project_id
        known = set([time.mktime(time.strptime(s, "%Y-%m-%d-%H%M%S")) for s in self.snapshots()])
        v = sorted(os.listdir(snap_path))
        if len(v) > max_snaps:
            trim = math.ceil(len(v)/max_snaps)
            w = [v[i] for i in range(len(v)) if i%trim==0]
            for i in range(1,5):
                if w[-i] != v[-i]:
                    w.append(v[-i])
            v = w

        v = [snapshot for snapshot in v if snapshot not in known]
        for i, snapshot in enumerate(v):
            print "**** %s/%s ****"%(i+1,len(v))
            tm = time.mktime(time.strptime(snapshot, "%Y-%m-%dT%H:%M:%S"))
            self.save(path=os.path.join(snap_path, snapshot), timestamp=tm)




if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Bup-backed SMC project storage system")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser.add_argument("project_id", help="project id -- most subcommand require this", type=str)

    parser_init = subparsers.add_parser('init', help='init project repo and directory')
    parser_init.set_defaults(func=lambda args: project.init())

    update_start = subparsers.add_parser('start', help='create user, setup ssh access and the ~/.sagemathcloud filesystem')
    update_start.set_defaults(func=lambda args: project.start())

    parser_account_settings = subparsers.add_parser('account_settings', help='set account_settings for this user; also outputs settings in JSON')
    parser_account_settings.add_argument("--memory", dest="memory", help="memory account_settings in gigabytes",
                               type=int, default=None)
    parser_account_settings.add_argument("--cpu_shares", dest="cpu_shares", help="shares of the cpu",
                               type=int, default=None)
    parser_account_settings.add_argument("--cores", dest="cores", help="max number of cores (may be float)",
                               type=float, default=None)
    parser_account_settings.add_argument("--disk", dest="disk", help="working disk space in gigabytes", type=int, default=None)
    parser_account_settings.add_argument("--inode", dest="inode", help="inode account_settings", type=int, default=None)
    parser_account_settings.add_argument("--login_shell", help="the login shell used when creating user", default=None, type=str)
    parser_account_settings.set_defaults(func=lambda args: project.account_settings(
                    memory=args.memory, cpu_shares=args.cpu_shares,
                    cores=args.cores, disk=args.disk, inode=args.inode,
                    login_shell=args.login_shell))

    parser_kill = subparsers.add_parser('kill', help='Kill all processes running as this user.')
    parser_kill.set_defaults(func=lambda args: project.kill())

    parser_save = subparsers.add_parser('save', help='save a snapshot')
    parser_save.add_argument("--branch", dest="branch", help="save to specified branch (default: whatever current branch is); will change to that branch if different", type=str, default='')
    parser_save.set_defaults(func=lambda args: project.save(branch=args.branch))
    parser_tag = subparsers.add_parser('tag', help='tag the *latest* commit to master, or delete a tag')

    parser_tag.add_argument("tag", help="tag name", type=str)
    parser_tag.add_argument("--delete", help="delete the given tag",
                                   dest="delete", default=False, action="store_const", const=True)
    parser_tag.set_defaults(func=lambda args: project.tag(tag=args.tag, delete=args.delete))

    parser_sync = subparsers.add_parser('sync', help='sync with all replicas')
    parser_sync.add_argument("--destructive", help="sync, destructively overwriting all remote replicas (DANGEROUS)",
                                   dest="destructive", default=False, action="store_const", const=True)
    parser_sync.set_defaults(func=lambda args: project.sync(destructive=args.destructive))


    if UNSAFE_MODE:
        parser_archive = subparsers.add_parser('archive', help="*DANGEROUS*: Remove the user's files, leaving only the bup repo.")
        parser_archive.set_defaults(func=lambda args: project.archive())

        parser_destroy = subparsers.add_parser('destroy', help='**DANGEROUS**: Delete all traces of this project from this machine.')
        parser_destroy.set_defaults(func=lambda args: project.destroy())

    parser_snapshots = subparsers.add_parser('snapshots', help='output JSON list of snapshots of current branch')
    parser_snapshots.add_argument("--branch", dest="branch", help="show for given branch (by default the current one)", type=str, default='')
    parser_snapshots.set_defaults(func=lambda args: print_json(project.snapshots(branch=args.branch)))

    parser_branches = subparsers.add_parser('branches', help='output JSON {branches:[list of branches], branch:"name"}')
    parser_branches.set_defaults(func=lambda args: print_json(project.branches()))

    parser_checkout = subparsers.add_parser('checkout', help='checkout snapshot of project to working directory (DANGEROUS)')
    parser_checkout.add_argument("--snapshot", dest="snapshot", help="which tag or snapshot to checkout (default: latest)", type=str, default='latest')
    parser_checkout.add_argument("--branch", dest="branch", help="branch to checkout (default: whatever current branch is)", type=str, default='')
    parser_checkout.set_defaults(func=lambda args: project.checkout(snapshot=args.snapshot, branch=args.branch))

    parser_ensure_ssh_access = subparsers.add_parser('ensure_ssh_access', help='add public key so user can ssh into the project')
    parser_ensure_ssh_access.set_defaults(func=lambda args: project.ensure_ssh_access())

    parser_replicas = subparsers.add_parser('replicas', help='add or remove replicas; always outputs list of replicas in JSON')
    parser_replicas.add_argument("--add", dest="add", help="add replicas: host1,host2,...", type=str, default='')
    parser_replicas.add_argument("--remove", dest="remove", help="remove replicas: host1,host2,...", type=str, default='')
    def replicas(add, remove):
        print project.replicas(add=add, remove=remove)
    parser_replicas.set_defaults(func=lambda args: replicas(add=args.add, remove=args.remove))

    parser_migrate_all = subparsers.add_parser('migrate_all', help='migrate all snapshots of project from old ZFS format')
    parser_migrate_all.set_defaults(func=lambda args: project.migrate_all())

    args = parser.parse_args()

    t0 = time.time()
    project = Project(project_id  = args.project_id,
                      login_shell = args.login_shell)
    args.func(args)
    log("total time: %s seconds"%(time.time()-t0))

