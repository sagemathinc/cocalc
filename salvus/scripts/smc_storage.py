#!/usr/bin/env python

import argparse, hashlib, os, time, uuid

from subprocess import Popen, PIPE

def uid(project_id):
    # We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
    # user could somehow generate an account id of their choosing, this wouldn't help them get the
    # same uid as another user.
    # 2^31-1=max uid which works with FUSE and node (and Linux, which goes up to 2^32-2).
    n = int(hashlib.sha512(project_id).hexdigest()[:8], 16)
    return n if n>1000 else n+1000

def now():
    return time.strftime('%Y-%m-%dT%H:%M:%S')

def cmd(s, ignore_errors=False):
    print s
    t = time.time()
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
    x = out.stdout.read() + out.stderr.read()
    e = out.wait()  # this must be *after* the out.stdout.read(), etc. above or will hang when output large!
    print "(%s seconds): %s"%(time.time()-t, x)
    if e:
        if ignore_errors:
            return x + "ERROR"
        else:
            raise RuntimeError(x)
    return x

def sync():
    print("syncing file system")
    cmd("sync")

def filesystem_exists(fs):
    try:
        cmd("zfs list %s"%fs)
        return True
    except:
        return False

def newest_snapshot(fs):
    out = cmd("zfs list -r -t snapshot -o name -s creation %s |tail -1"%fs)
    if 'dataset does not exist' in out:
        return None
    if 'no datasets available' in out:
        return None
    if not out.startswith(fs+"@"):
        raise RuntimeError("output should start with filesystem name")
    else:
        return out[len(fs)+1:].strip()

def mount(mountpoint, fs):
    cmd("zfs set mountpoint='%s' %s"%(mountpoint, fs))
    e = cmd("zfs mount %s"%fs, ignore_errors=True).strip()
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
        cmd("cat '%s' | lz4c -d - | zfs recv -v %s"%(self.path, self.project.image_fs))

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
            print "%s(project_id=%s,%s): %s"%(funcname, self.project_id, kwds, mesg)
        f()
        return f

    def create(self, quota):
        """
        Create and mount storage for the given project.
        """
        log = self._log("create")
        log("create new zfs filesystem POOL/images/project_id (error if it exists already)")
        cmd("zfs create %s"%self.image_fs)
        mount('/'+self.image_fs, self.image_fs)
        log("create a sparse image file of size %s"%quota)
        u = "/%s/%s.img"%(self.image_fs, uuid.uuid4())
        cmd("truncate -s%s %s"%(quota, u))
        log("create a pool projects-project_id on the sparse image")
        cmd("zpool create %s -m '%s' %s"%(self.project_pool, self.project_mnt, u))
        cmd("zfs set compression=lz4 %s"%self.project_pool)
        cmd("zfs set dedup=on %s"%self.project_pool)
        os.chown(self.project_mnt, self.uid, self.uid)

    def umount(self):
        """
        Unmount the given project.
        """
        log = self._log("umount")
        log("exporting project pool")
        cmd("pkill -u %s; sleep 1; pkill -9 -u %s; sleep 1"%(self.uid,self.uid), ignore_errors=True)
        cmd("zpool export %s"%self.project_pool)
        sync()
        log("unmounting image filesystem")
        cmd("zfs set mountpoint=none %s"%self.image_fs)

    def is_project_pool_imported(self):
        s = cmd("zpool list %s"%self.project_pool, ignore_errors=True)
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
            cmd("zpool import -fN %s -d '/%s'"%(self.project_pool, self.image_fs))
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
            if os.path.isfile(p):
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
        Snapshot image filesystem, and save the stream to get there to the streams directory.
        """
        log = self._log("save")
        sync()
        end = now()
        log("snapshotting image filesystem %s"%end)
        cmd("zfs snapshot %s@%s"%(self.image_fs, end))
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
            cmd("zfs send -Dv %s | lz4c - > %s"%(snap, target))
            if discard is not None:
                log("success; now discarding a previous stream: %s"%discard.path)
                os.unlink(discard.path)
        except RuntimeError:
            log("problem sending stream -- don't leave a broken stream around")
            try:
                os.unlink(target)
            except: pass
            raise

    def snapshot(self):
        """
        Snapshot the given project with the current time.
        """
        log = self._log("snapshot_project")
        cmd("zfs snapshot %s@%s"%(self.project_pool, now()))

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
        cmd("zpool add %s %s"%(self.project_pool, u))

    def close(self):
        """
        Save, unmount, then destroy image filesystem, leaving only streams.
        """
        log = self._log("close")
        self.save()
        self.umount()
        self.destroy_image_fs()

    def destroy_image_fs(self):
        """
        Destroy the image filesystem.
        """
        log = self._log("destroy_image_fs")
        cmd("zfs destroy -r %s"%self.image_fs)

    def destroy_streams(self):
        """
        Destroy all the streams associated to this project.
        """
        log = self._log("destroy_streams")
        for x in os.listdir(self.stream_path):
            log("destroying stream %s"%x)
            os.unlink(os.path.join(self.stream_path, x))


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

    parser_close = subparsers.add_parser('close', help='save, unmount, destroy images, etc., leaving only streams')
    parser_close.set_defaults(func=lambda args: project.close())

    parser_snapshot = subparsers.add_parser('snapshot', help='snapshot the project')
    parser_snapshot.set_defaults(func=lambda args: project.snapshot())

    parser_increase_quota = subparsers.add_parser('increase_quota', help='increase quota')
    parser_increase_quota.add_argument("--amount", dest="amount", help="amount (default: '5G')", type=str, default='5G')
    parser_increase_quota.set_defaults(func=lambda args: project.increase_quota(amount=args.amount))

    args = parser.parse_args()

    if not args.mnt:
        args.mnt = '/' + os.path.join(args.pool, args.project_id)
    if not args.stream_path:
        args.stream_path = '/' + os.path.join(args.pool, 'streams', args.project_id)

    project = Project(project_id  = args.project_id,
                      mnt         = args.mnt,
                      pool        = args.pool,
                      stream_path = args.stream_path)
    args.func(args)

