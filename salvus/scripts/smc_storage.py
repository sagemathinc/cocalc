#!/usr/bin/env python

"""

* The storage user, which uses this script, must have visudo setup like this:

    storage ALL=(ALL) NOPASSWD: /sbin/zfs *
    storage ALL=(ALL) NOPASSWD: /sbin/zpool *
    storage ALL=(ALL) NOPASSWD: /usr/bin/pkill *

* Migration commands can only be run as root; everything else should be run as storage user.



"""

import argparse, hashlib, os, random, shutil, string, sys, time, uuid, json
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

def cmd(s, ignore_errors=False, verbose=2):
    if verbose >= 1:
        log(s)
    t = time.time()
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

def sync():
    print("syncing file system")
    cmd("sync")

def filesystem_exists(fs):
    try:
        cmd("sudo zfs list %s"%fs)
        return True
    except:
        return False

def newest_snapshot(fs):
    out = cmd("sudo zfs list -r -t snapshot -o name -s creation %s |tail -1"%fs)
    if 'dataset does not exist' in out:
        return None
    if 'no datasets available' in out:
        return None
    if not out.startswith(fs+"@"):
        raise RuntimeError("output should start with filesystem name")
    else:
        return out[len(fs)+1:].strip()

def snapshots(filesystem):
    w = cmd(['sudo', 'zfs', 'list', '-r', '-t', 'snapshot', '-o', 'name', '-s', 'creation', filesystem], verbose=1).split()
    return [x.split('@')[1].strip() for x in w if '@' in x]

def mount(mountpoint, fs):
    cmd("sudo zfs set mountpoint='%s' %s"%(mountpoint, fs))
    e = cmd("sudo zfs mount %s"%fs, ignore_errors=True)
    if not e or 'filesystem already mounted' in e:
        return
    raise RuntimeError(e)

class Stream(object):
    def __init__(self, project, path):
        self.project = project
        self.path    = path
        self.filename = os.path.split(path)[-1]
        self.start, self.end = self.filename.split('--')

    def __repr__(self):
        return "Stream(%s): %s to %s stored in %s"%(self.project.project_id, self.start, self.end, self.path)

    def __cmp__(self, other):
        return cmp((self.end, self.start), (other.end, other.start))

    def size_mb(self):
        return int(os.path.getsize(self.path)/1e6)

    def apply(self):
        """
        Apply this stream to the image storage for its project.
        """
        if self.project.is_project_pool_imported():
            raise RuntimeError("cannot receive stream while pool already imported")
        cmd("cat '%s' | lz4c -d - | sudo zfs recv -v %s"%(self.path, self.project.image_fs))

class Project(object):
    def __init__(self, project_id, pool, mnt, stream_path):
        self.project_id = project_id
        self.pool = pool
        self.uid = uid(project_id)
        self.stream_path = stream_path
        if not os.path.exists(self.stream_path):
            os.makedirs(self.stream_path)
        self.image_fs = os.path.join(self.pool, 'images', project_id)
        self.project_pool = "project-%s"%self.project_id
        self.project_mnt  = mnt
        self.uid = uid(project_id)
        self.stream_thresh_mb = 25

    def __repr__(self):
        return "Project(%s)"%project_id

    def _log(self, funcname, **kwds):
        def f(mesg=''):
            log("%s(project_id=%s,%s): %s"%(funcname, self.project_id, kwds, mesg))
        f()
        return f

    def create(self, quota):
        """
        Create and mount storage for the given project.
        """
        log = self._log("create")
        if len(os.listdir(self.stream_path)) > 0:
            return
        log("create new zfs filesystem POOL/images/project_id (error if it exists already)")
        cmd("sudo zfs create %s"%self.image_fs)
        mount('/'+self.image_fs, self.image_fs)
        log("create a sparse image file of size %s"%quota)
        u = "/%s/%s.img"%(self.image_fs, uuid.uuid4())
        cmd("truncate -s%s %s"%(quota, u))
        log("create a pool projects-project_id on the sparse image")
        cmd("sudo zpool create %s -m '%s' %s"%(self.project_pool, self.project_mnt, u))
        cmd("sudo zfs set compression=lz4 %s"%self.project_pool)
        cmd("sudo zfs set dedup=on %s"%self.project_pool)
        os.chown(self.project_mnt, self.uid, self.uid)

    def umount(self):
        """
        Unmount the given project.
        """
        log = self._log("umount")
        log("exporting project pool")
        cmd("sudo pkill -u %s; sleep 1; sudo pkill -9 -u %s; sleep 1"%(self.uid,self.uid), ignore_errors=True)
        e = cmd("sudo zpool export %s"%self.project_pool, ignore_errors=True)
        if e and 'no such pool' not in e:
            raise RuntimeError(e)
        sync()
        log("unmounting image filesystem")
        e = cmd("sudo zfs set mountpoint=none %s"%self.image_fs, ignore_errors=True)
        if e and 'dataset does not exist' not in e:
            raise RuntimeError(e)
        if os.path.exists('/'+self.image_fs):
            os.rmdir('/' + self.image_fs)
        if os.path.exists(self.project_mnt):
            os.rmdir(self.project_mnt)

    def is_project_pool_imported(self):
        s = cmd("sudo zpool list %s"%self.project_pool, ignore_errors=True)
        if 'no such pool' in s:
            return False
        elif 'ONLINE' in s:
            return True
        else:
            raise RuntimeError(s)

    def mount(self):
        """
        Mount the given project.
        """
        log = self._log("mount")
        if not self.is_project_pool_imported():
            log("project pool not imported, so receiving streams")
            self.recv_streams()
            mount('/'+self.image_fs, self.image_fs)
            log("now importing project pool from /%s"%self.image_fs)
            cmd("sudo zpool import -fN %s -d '/%s'"%(self.project_pool, self.image_fs))
        log("setting mountpoint to %s"%self.project_mnt)
        mount(self.project_mnt, self.project_pool)

    def streams(self):
        """
        Return sorted list of the streams for this project.
        """
        log = self._log("streams")
        log("getting streams from %s"%self.stream_path)
        v = []
        for x in os.listdir(self.stream_path):
            p = os.path.join(self.stream_path, x)
            if os.path.isfile(p) and not x.endswith(".partial"):
                v.append(Stream(self, p))
        v.sort()
        log("found %s streams"%len(v))
        return v

    def recv_streams(self):
        """
        Receive any streams that haven't been applied to the image filesystem.
        """
        log = self._log("recv_streams")
        head = newest_snapshot(self.image_fs)
        log("newest known snapshot is %s"%head)
        for stream in self.streams():
            if stream.end > head:
                log("found newer %s so applying it"%stream.end)
                stream.apply()
                head = newest_snapshot(self.image_fs)

    def save(self):
        """
        Snapshot image filesystem, and update corresponding streams.
        """
        log = self._log("save")
        sync()
        end = now()
        log("snapshotting image filesystem %s"%end)
        e = cmd("sudo zfs snapshot %s@%s"%(self.image_fs, end), ignore_errors=True)
        if e:
            if 'dataset does not exist' in e:
                # not mounted -- nothing to do
                return
            else:
                raise RuntimeError(e)
        v = self.streams()
        log("there are %s streams already"%len(v))
        if len(v) > 0 and v[-1].size_mb() < self.stream_thresh_mb:
            log("last stream is small -- on success discard")
            discard = v[-1]
            del v[-1]
        else:
            discard = None

        if len(v) == 0:
            start = end
            snap = "%s@%s"%(self.image_fs, end)
        else:
            start = v[-1].end
            snap = " -i %s@%s %s@%s"%(self.image_fs, start, self.image_fs, end)

        target = os.path.join(self.stream_path, "%s--%s"%(start, end))
        try:
            log("sending new stream: %s"%target)
            try:
                cmd("sudo zfs send -Dv %s | lz4c - > %s.partial && mv %s.partial %s"%(snap, target, target, target))
            except:
                os.unlink("%s.partial"%target)
                raise
            if discard is not None:
                log("success; now discarding a previous stream: %s"%discard.path)
                os.unlink(discard.path)
        except RuntimeError:
            log("problem sending stream -- don't leave a broken stream around")
            try:
                os.unlink(target)
            except: pass
            raise

    def snapshot(self, name=''):
        """
        Snapshot with the current time if name='', else the given name.

        The project must be mounted.
        """
        if not name:
            name = now()
        log = self._log("snapshot_project")
        cmd(["sudo", "zfs", "snapshot", "%s@%s"%(self.project_pool, name)])

    def destroy_snapshot(self, name):
        """
        Delete the specified snapshot of this project.
        """
        cmd(["sudo", "zfs", "destroy", "%s@%s"%(self.project_pool, name)])

    def snapshots(self):
        """
        Return list of all snapshots in date order of the project pool.

        The project must be mounted.
        """
        return snapshots(self.project_pool)

    def increase_quota(self, amount):
        """
        Increase the quota of the project by the given amount.
        """
        log = self._log("increase_quota")
        log("create a new sparse image file of size %s"%amount)
        for i in range(100):
            u = "/%s/%s.img"%(self.image_fs, uuid.uuid4())
            if not os.path.exists(u):
                break
        if os.path.exists(u):
            raise RuntimeError("impossible situation with uuid not being random.")
        log("creating sparse image file %s of size %s"%(u, amount))
        cmd("truncate -s%s %s"%(amount, u))
        log("adding sparse image file %s to pool %s"%(u, self.project_pool))
        cmd("sudo zpool add %s %s"%(self.project_pool, u))

    def close(self):
        """
        Save, unmount, then destroy image filesystem, leaving only streams.
        """
        log = self._log("close")
        self.save()
        self.umount()
        self.destroy_image_fs()

    def replicate(self, target):
        """
        Replicate the streams for this project from this node to the given target.

        The stream paths have to be identical on the source and target machines.
        """
        cmd("rsync -axvH %s/ %s:%s/"%(self.stream_path, target, self.stream_path))

    def destroy_image_fs(self):
        """
        Destroy the image filesystem.
        """
        log = self._log("destroy_image_fs")
        e = cmd("sudo zfs destroy -r %s"%self.image_fs, ignore_errors=True)
        if e and 'dataset does not exist' not in e:
            raise RuntimeError(e)

    def destroy_streams(self):
        """
        Destroy all the streams associated to this project.
        """
        log = self._log("destroy_streams")
        log("removing the entire directory tree: '%s'"%self.stream_path)
        shutil.rmtree(self.stream_path)

    def destroy(self):
        """
        Delete all traces of this project from this machine.  *VERY DANGEROUS.*
        """
        self.umount()
        self.destroy_image_fs()
        self.destroy_streams()


    # NOTE -- all migrate stuff must be run as root. #

    def _create_migrate_user(self):
        u = self.uid
        username = 'migrate%s'%u
        self._delete_migrate_user()
        cmd('groupadd -g %s -o %s'%(u,username))
        cmd('useradd -u %s -g %s -o %s'%(u,u,username))
        return username

    def _delete_migrate_user(self):
        u = self.uid
        username = 'migrate%s'%u
        cmd('userdel %s; groupdel %s'%(username, username), ignore_errors=True)

    def migrate(self):
        """
        Create the project with the appropriate quota, then migrate over all snapshots.
        Assumes the project has not already been created.
        """
        log = self._log("migrate")
        log("figure out original quota")
        quota = cmd("zfs get -H quota projects/%s"%self.project_id).split()[2]
        self.create(quota)
        log("now migrate all snapshots")
        self.migrate_snapshots()
        log("done -- now close the project")
        self.close()

    def migrate_snapshots(self, snapshot=None):
        """
        Copy over the given snapshot from the old project, and also make the current live
        contents of this project equal to that snapshot.

        If snapshot is not given, copy over in order all snapshots we don't currently have.

        We use this only to migrate from the old to the new format.
        """
        if snapshot is not None:
            log = self._log("migrate_snapshots", snapshot=snapshot)
        else:
            log = self._log("migrate_snapshots")

        self.mount()
        fs = 'projects/%s'%self.project_id
        mount('/' + fs, fs)

        def setup_user():
            global passwd
            username = self._create_migrate_user()
            alpha = string.lowercase + string.digits
            passwd = ''.join([random.choice(alpha) for _ in range(16)])
            passwd_file = os.path.join('/root', username)
            open(passwd_file,'w').write(passwd+'\n'+passwd)
            cmd("cat %s | passwd %s"%(passwd_file, username))
            return username, passwd_file

        def do_sync(username, passwd_file, snapshot):
            cmd("sshpass -f %s rsync -axH --delete /%s/.zfs/snapshot/%s/ %s@localhost:%s/"%(
                                         passwd_file, fs, snapshot, username, self.project_mnt))
            self.snapshot(snapshot)

        def remove_user(passwd_file):
            os.unlink(passwd_file)
            self._delete_migrate_user()


        if snapshot is None:
            log("migrating all missing snapshots")
            s = set(self.snapshots())
            t = snapshots(fs)
            todo = [snapshot for snapshot in t if snapshot not in s]
            i = 1
            if len(todo) == 0:
                return
            tm = time.time()
            username, passwd_file = setup_user()
            recent_times = []
            for snapshot in todo:
                if len(recent_times)>0:
                    time_per = sum(recent_times)/len(recent_times)
                    tr = (time_per * (len(todo)-i+1))/60.0
                else:
                    tr = 999999
                log("migrating missing snapshot (%s/%s; set time remaining: %.1f minutes): %s"%(
                              i, len(todo), tr, snapshot))
                tm0 = time.time()
                do_sync(username, passwd_file, snapshot)
                recent_times.append(time.time() - tm0)
                if len(recent_times) > 10:
                    del recent_times[0]
                i += 1

            remove_user(passwd_file)
        else:
            username, passwd_file = setup_user()
            do_sync(username, passwd_file, snapshot)
            remove_user(passwd_file)


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="SMC project storage system")
    subparsers = parser.add_subparsers(help='sub-command help')


    parser.add_argument("project_id", help="project id", type=str)

    parser.add_argument("--pool", help="ZFS pool (default:'projects-new')", default="projects-new", type=str)
    parser.add_argument("--mnt", help="mountpoint for the project (default:'/[pool]/[project_id]')", default="", type=str)
    parser.add_argument("--stream_path", help="directory where streams are stored for this project(default: '/[pool]/streams/[project_id]')", default="", type=str)

    parser_create = subparsers.add_parser('create', help='create filesystem')
    parser_create.add_argument("--quota", dest="quota", help="disk quota (default: '5G')", type=str, default='5G')
    parser_create.set_defaults(func=lambda args: project.create(quota=args.quota))

    parser_umount = subparsers.add_parser('umount', help='unmount filesystem')
    parser_umount.set_defaults(func=lambda args: project.umount())

    parser_mount = subparsers.add_parser('mount', help='mount filesystem')
    parser_mount.set_defaults(func=lambda args: project.mount())

    parser_save = subparsers.add_parser('save', help='save active project to streams')
    parser_save.set_defaults(func=lambda args: project.save())

    parser_replicate = subparsers.add_parser('replicate', help='replicate active project to streams')
    parser_replicate.add_argument("target", help="target hostname", type=str)
    parser_replicate.set_defaults(func=lambda args: project.replicate(args.target))

    parser_close = subparsers.add_parser('close', help='save, unmount, destroy images, etc., leaving only streams')
    parser_close.set_defaults(func=lambda args: project.close())

    parser_destroy = subparsers.add_parser('destroy', help='Delete all traces of this project from this machine.  *VERY DANGEROUS.*')
    parser_destroy.set_defaults(func=lambda args: project.destroy())

    parser_snapshot = subparsers.add_parser('snapshot', help='snapshot the project')
    parser_snapshot.add_argument("--name", dest="name", help="name of snapshot (default: ISO date)", type=str, default='')
    parser_snapshot.set_defaults(func=lambda args: project.snapshot(args.name))

    parser_destroy_snapshot = subparsers.add_parser('destroy_snapshot', help='destroy a snapshot of the project')
    parser_destroy_snapshot.add_argument("--name", dest="name", help="name of snapshot", type=str)
    parser_destroy_snapshot.set_defaults(func=lambda args: project.destroy_snapshot(args.name))

    parser_snapshots = subparsers.add_parser('snapshots', help='show list of snapshots of the given project (JSON)')
    parser_snapshots.set_defaults(func=lambda args: print_json(project.snapshots()))

    parser_increase_quota = subparsers.add_parser('increase_quota', help='increase quota')
    parser_increase_quota.add_argument("--amount", dest="amount", help="amount (default: '5G')", type=str, default='5G')
    parser_increase_quota.set_defaults(func=lambda args: project.increase_quota(amount=args.amount))

    parser_migrate = subparsers.add_parser('migrate', help='migrate old project: creates, migrate all snapshots, then close')
    parser_migrate.set_defaults(func=lambda args: project.migrate())

    parser_migrate_snapshots = subparsers.add_parser('migrate_snapshots', help='ensure new project has all snapshots from old project')
    parser_migrate_snapshots.set_defaults(func=lambda args: project.migrate_snapshots())

    args = parser.parse_args()

    if not args.mnt:
        args.mnt = '/' + os.path.join(args.pool, args.project_id)
    if not args.stream_path:
        args.stream_path = '/' + os.path.join(args.pool, 'streams', args.project_id)

    t0 = time.time()
    project = Project(project_id  = args.project_id,
                      mnt         = args.mnt,
                      pool        = args.pool,
                      stream_path = args.stream_path)
    args.func(args)
    log("total time: %s seconds"%(time.time()-t0))

