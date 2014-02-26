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
    def __init__(self, project_id, pool, mountpoint, stream_path):
        self.project_id = project_id
        self.pool = pool
        self.uid = uid(project_id)
        self.stream_path = stream_path
        if not os.path.exists(self.stream_path):
            os.makedirs(self.stream_path)
        self.image_fs = os.path.join(self.pool, 'images', project_id)
        self.project_pool = "project-%s"%self.project_id
        self.project_mnt  = mountpoint
        self.uid = uid(project_id)
        self.stream_thresh_mb = 100   # 100 megabytes

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
        cmd("zfs set mountpoint=/%s %s"%(self.image_fs, self.image_fs))
        log("create a sparse image file of size %s"%quota)
        u = "/%s/%s.img"%(self.image_fs, uuid.uuid4())
        cmd("truncate -s%s "%(quota, u))
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
        cmd("pkill -u %s; sleep 1; pkill -9 -u %s; sleep 1"%(u,u), ignore_errors=True)
        cmd("zpool export %s"%self.project_pool)
        sync()
        log("unmounting image filesystem")
        log("zfs set mountpoint=none %s"%self.image_fs)

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
            log("now importing project pool from %s"%self.image_fs)
            cmd("zpool import -fN %s -d '%s'"%(self.project_pool, self.image_fs))
        log("setting mountpoint to %s"%self.project_mnt)
        cmd("zfs set mountpoint='%s' %s"%(self.project_mnt, self.project_pool))

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
        head = newest_snapshot(self.image_fs)
        for stream in self.streams():
            if stream.end > head:
                stream.apply()
                head = newest_snapshot(self.image_fs)

    def update_streams(self):
        """
        Snapshot image filesystem, and save a stream to get there to the streams directory.
        """
        sync()
        end = now()
        cmd("zfs snapshot %s@%s"%(self.image_fs, end))
        v = self.streams()
        discard = None
        if len(v) == 0:
            start = end
            snap = "%s@%s"%(self.image_fs, end)
        else if len(v) == 1:
            start = v[-1].end
            snap = " -i %s@%s %s@%s"%(self.image_fs, start, self.image_fs, end)
        else:
            if v[-1].size_mb() < self.stream_thresh_mb:
                # on success, discard last one, since it is still too small.
                start = v[-2].end
                snap = " -i %s@%s %s@%s"%(self.image_fs, start, self.image_fs, end)
                discard = v[-1]
            start = v[-2].end

        target = os.path.join(self.stream_path, "%s--%s"%(start, end))
        try:
            cmd("zfs send -Dv %s | lz4c - > %s"%(snap, target))
            if discard:
                os.unlink(discard.path)
        except RuntimeError:
            # don't leave a broken stream around
            try:
                os.unlink(target)
            except: pass
            raise

    def snapshot_project(self):
        """
        Snapshot the given project with the current time.
        """
        cmd("zfs snapshot %s@%s"%(self.project_pool, now()))

    def increase_quota(self, quota):
        """
        Increase the quota of the project by the given amount.
        """
        log("create a sparse image file of size %s"%quota)
        while True:
            u = "/%s/%s.img"%(self.image_fs, uuid.uuid4())
            if not os.path.exists(u):
                break
        cmd("truncate -s%s %s"%(quota, u))
        log("create a pool projects-project_id on the sparse image")
        cmd("zpool create %s -m '%s' %s"%(self.project_pool, self.project_mnt, u))

    def close(self):
        """
        Save, unmount, then destroy image filesystem, leaving only streams.
        """
        self.update_stream()
        self.umount()
        self.destroy_image_fs()

    def destroy_image_fs(self):
        """
        Destroy the image filesystem.
        """
        cmd("zfs destroy -r %s"%self.image_fs)

    def destroy_streams(self):
        """
        Destroy all the streams associated to this project.
        """
        for x in os.listdir(self.stream_path):
            os.unlink(os.path.join(self.stream_path, x))


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="SMC project storage system")

    parser.add_argument("--pool", help="ZFS pool (default:'projects-new')", default="projects-new", type=str)
    parser.add_argument("--mnt", help="mountpoint for the project (default:'/[pool]/[project_id]')", default="", type=str)
    parser.add_argument("--streams", help="directory where streams are stored (default: '/[pool]/streams/[project_id]')", default="", type=str)
    parser.add_argument("project_id", help="project id", type=str)

    subparsers = parser.add_subparsers(help='sub-command help')

    parser_create = subparsers.add_parser('create', help='create filesystem')
    parser_create.add_argument("--quota", dest="quota", help="disk quota (default: '10G')", type=str, default='10G')
    parser_create.set_defaults(func=lambda args: project.create(quota=args.quota))

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

