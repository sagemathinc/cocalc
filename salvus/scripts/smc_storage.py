#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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



"""

# The salvus use that sues this script must have visudo setup like this:

salvus ALL=(ALL) NOPASSWD: /sbin/zfs *
salvus ALL=(ALL) NOPASSWD: /sbin/zpool *
salvus ALL=(ALL) NOPASSWD: /usr/bin/pkill *

# While migrating, we also need all the following.  REMOVE these from visudo after migration.

salvus ALL=(ALL) NOPASSWD: /usr/bin/passwd *
salvus ALL=(ALL) NOPASSWD: /usr/bin/rsync *
salvus ALL=(ALL) NOPASSWD: /bin/chown *
salvus ALL=(ALL) NOPASSWD: /usr/sbin/groupadd *
salvus ALL=(ALL) NOPASSWD: /usr/sbin/useradd *
salvus ALL=(ALL) NOPASSWD: /usr/sbin/groupdel *
salvus ALL=(ALL) NOPASSWD: /usr/sbin/userdel *


"""

DEFAULT_QUOTA='5G'

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
        cmd("sudo /sbin/zfs list %s"%fs)
        return True
    except:
        return False

def newest_snapshot(fs):
    out = cmd("sudo /sbin/zfs list -r -t snapshot -o name -s creation %s |tail -1"%fs)
    if 'dataset does not exist' in out:
        return None
    if 'no datasets available' in out:
        return None
    if not out.startswith(fs+"@"):
        raise RuntimeError("output should start with filesystem name")
    else:
        return out[len(fs)+1:].strip()

def snapshots(filesystem):
    w = cmd(['sudo', 'zfs', 'list', '-r', '-t', 'snapshot', '-o', 'name', '-s', 'creation', filesystem], verbose=1, ignore_errors=True)
    if 'dataset does not exist' in w or 'no datasets available' in w:
        return []
    else:
        return [x.split('@')[1].strip() for x in w.split() if '@' in x]

def mount(mountpoint, fs):
    if cmd("sudo /sbin/zfs get -H mounted %s"%fs).split()[2] == 'yes' and cmd("sudo /sbin/zfs get -H mountpoint %s"%fs).split()[2] == mountpoint:
        # already done.
        return

    cmd("sudo /sbin/zfs set mountpoint='%s' %s"%(mountpoint, fs))
    e = cmd("sudo /sbin/zfs mount %s"%fs, ignore_errors=True)
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
        cmd("cat '%s' | lz4c -d - | sudo /sbin/zfs recv -F %s"%(self.path, self.project.image_fs))

def optimal_stream_sequence(v):
    if len(v) == 0:
        return v
    v = list(v) # make a copy
    def f(a,b):
        if a.end > b.end:
            # newest ending is earliest
            return -1
        elif a.end < b.end:
            # newest ending is earliest
            return +1
        else:
            # both have same ending; take the one with longest interval, i.e., earlier start, as before
            if a.start < b.start:
                return -1
            elif a.start > b.start:
                return +1
            else:
                return 0
    v.sort(f)
    while True:
        if len(v) == 0:
            return []
        w = []
        i = 0
        while i < len(v):
            x = v[i]
            w.append(x)
            # now move i forward to find an element of v whose end equals the start of x
            start = x.start
            i += 1
            while i < len(v):
                if v[i].end == start:
                    break
                i += 1
        # Did we end with a an interval of length 0, i.e., a valid sequence?
        x = w[-1]
        if x.start == x.end:
            return list(reversed(w))
        if len(v) > 0:
            del v[0]  # delete first element -- it's not the end of a valid sequence.

class Project(object):
    def __init__(self, project_id, pool, mnt, stream_path, login_shell='/bin/bash'):
        if mnt.startswith('/projects/'):
            # kill by default when unmounting, exporting, etc., since use could be running code in there.
            self._kill = True
            self._is_new = True
        else:
            self._kill = False
            self._is_new = False
        if uuid.UUID(project_id).get_version() != 4:
            raise RuntimeError("invalid project uuid='%s'"%project_id)
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
        self.stream_thresh_mb = 10
        self.username = self.project_id.replace('-','')
        self.login_shell = login_shell

    def __repr__(self):
        return "Project(%s)"%project_id

    def _log(self, funcname, **kwds):
        def f(mesg=''):
            log("%s(project_id=%s,%s): %s"%(funcname, self.project_id, kwds, mesg))
        f()
        return f

    def create_user(self):
        u = self.uid
        cmd('sudo /usr/sbin/groupadd -g %s -o %s'%(u, self.username), ignore_errors=True)
        cmd('sudo /usr/sbin/useradd -u %s -g %s -o %s -d %s -s %s'%(u,u, self.username, self.project_mnt, self.login_shell), ignore_errors=True)

    def delete_user(self):
        u = self.uid
        cmd('sudo /usr/sbin/userdel %s; sudo /usr/sbin/groupdel %s'%(self.username, self.username), ignore_errors=True)


    def create(self, quota=DEFAULT_QUOTA):
        """
        Create and mount storage for the given project.
        """
        log = self._log("create")
        if len(optimal_stream_sequence(self.streams())) > 0:
            self.import_pool()
            return
        log("create new zfs filesystem POOL/images/project_id (error if it exists already)")
        cmd("sudo /sbin/zfs create %s"%self.image_fs)
        mount('/'+self.image_fs, self.image_fs)
        cmd("sudo /bin/chown %s:%s /%s"%(os.getuid(), os.getgid(), self.image_fs))
        log("create a sparse image file of size %s"%quota)
        u = "/%s/%s.img"%(self.image_fs, uuid.uuid4())
        cmd("truncate -s%s %s"%(quota, u))
        log("create a pool projects-project_id on the sparse image")
        cmd("sudo /sbin/zpool create %s -m '%s' %s"%(self.project_pool, self.project_mnt, u))
        cmd("sudo /sbin/zfs set compression=lz4 %s"%self.project_pool)
        cmd("sudo /sbin/zfs set dedup=on %s"%self.project_pool)
        cmd("sudo /bin/chown %s:%s %s"%(self.uid, self.uid, self.project_mnt))

        #os.chown(self.project_mnt, self.uid, self.uid)

    def umount(self, kill=None):
        """
        Unmount the given project.
        """
        if kill is None:
            kill = self._kill
        self.export_pool(kill=kill)
        self.umount_image_fs()

    def umount_image_fs(self):
        """
        Unmount the given project.
        """
        log("unmounting image filesystem")
        e = cmd("sudo /sbin/zfs set mountpoint=none %s"%self.image_fs, ignore_errors=True)
        if e and 'dataset does not exist' not in e:
            raise RuntimeError(e)
        if os.path.exists('/'+self.image_fs):
            os.rmdir('/' + self.image_fs)

    def is_project_pool_imported(self):
        s = cmd("sudo /sbin/zpool list %s"%self.project_pool, ignore_errors=True)
        if 'no such pool' in s:
            return False
        elif 'ONLINE' in s:
            return True
        else:
            raise RuntimeError(s)

    def import_pool(self):
        """
        Import the zpool from the images in the image filesystem and mount it.
        """
        log = self._log("import_pool")
        s = '/'+self.image_fs
        if len(optimal_stream_sequence(self.streams())) == 0:
            if os.path.exists(s) and len(os.listdir(s)) > 0:
                pass
            else:
                log("no streams and no images, so just create a new empty pool.")
                self.create(DEFAULT_QUOTA)
                return
        if not self.is_project_pool_imported():
            log("project pool not imported, so receiving streams")
            # The syncs below are *critical*; without it, we always get total deadlock from this following simple example:
            #     zfs rollback -r storage/images/bec33943-51b7-4ebb-b51b-15998a83775b@2014-03-14T16:22:43
            #     cat /storage/streams/bec33943-51b7-4ebb-b51b-15998a83775b/2014-03-14T16:22:43--2014-03-15T22:51:56 | lz4c -d - | sudo zfs recv storage/images/bec33943-51b7-4ebb-b51b-15998a83775b
            #     zpool import -fN project-bec33943-51b7-4ebb-b51b-15998a83775b -d /storage/images/bec33943-51b7-4ebb-b51b-15998a83775b/
            self.recv_streams()
            sync()
            mount(s, self.image_fs)
            sync()
            log("now importing project pool from /%s"%self.image_fs)
            cmd("sudo /sbin/zpool import -fN %s -d '/%s'"%(self.project_pool, self.image_fs))
        log("setting mountpoint to %s"%self.project_mnt)
        mount(self.project_mnt, self.project_pool)
        if self._is_new:
            self.create_user()

    def export_pool(self, kill=None):
        """
        Export the zpool mounted on the image files.
        """
        if kill is None:
            kill = self._kill
        log = self._log("umount")
        log("exporting project pool")
        if kill:
            log("killing all processes by user with id %s"%self.uid)
            cmd("sudo /usr/bin/pkill -u %s; sleep 1; sudo /usr/bin/pkill -9 -u %s; sleep 1"%(self.uid,self.uid), ignore_errors=True)
        cmd("sudo /sbin/zfs umount %s"%self.project_pool, ignore_errors=True)
        e = cmd("sudo /sbin/zpool export %s"%self.project_pool, ignore_errors=True)
        if e and 'no such pool' not in e:
            raise RuntimeError(e)
        sync()
        if self._is_new:
            self.delete_user()

    def streams(self):
        """
        Return sorted list of the streams for this project.
        """
        log = self._log("streams")
        log("getting streams from %s"%self.stream_path)
        v = []
        for x in os.listdir(self.stream_path):
            p = os.path.join(self.stream_path, x)
            if os.path.isfile(p) and not x.endswith(".partial") and not x.endswith('.tmp'):
                if os.path.getsize(p) == 15 and open(p).read() == '\x04"M\x18dp\xb9\x00\x00\x00\x00\x05]\xcc\x02':
                    # left over files from a bug which was fixed....
                    os.unlink(p)
                else:
                    v.append(Stream(self, p))
        v.sort()
        log("found %s streams"%len(v))
        return v

    def recv_streams(self):
        """
        Receive any streams that haven't been applied to the image filesystem.
        """
        log = self._log("recv_streams")
        if len(os.listdir(self.stream_path)) == 0:
            return
        if self.is_project_pool_imported():
            raise RuntimeError('cannot recv streams since project pool is already imported')
        snaps   = snapshots(self.image_fs)
        streams = optimal_stream_sequence(self.streams())
        log("optimal stream sequence: %s"%[x.filename for x in streams])
        log("snapshot sequence: %s"%snaps)

        # rollback the snapshot snaps[rollback_to] (if defined), so that snapshot no longer exists.
        rollback_to = len(snaps)

        # apply streams starting with streams[apply_starting_with]
        apply_starting_with = 0

        if len(snaps) == 0:
            pass # easy -- just apply all streams and no rollback needed
        elif len(snaps) == 1:
            if snaps[0] == streams[0].start:
                apply_starting_with = 1  # start with streams[1]; don't rollback at all
            else:
                apply_starting_with = 0  # apply all
                rollback_to = 0  # get rid of all snapshots
        elif len(streams) == 1:
            if len(snaps) == 0 and snaps[0] == streams.start:
                # nothing to do -- there's only one and it's applied
                return
            else:
                # must apply everything
                rollback_to = 0
                apply_starting_with = 0
        else:
            # figure out which streams to apply, and whether we need to rollback anything
            newest_snap = snaps[-1]
            apply_starting_with = len(streams) - 1
            while apply_starting_with >= 0 and rollback_to >= 1:
                print apply_starting_with, rollback_to
                if streams[apply_starting_with].start == newest_snap:
                    print "branch 0"
                    # apply starting here
                    break
                elif streams[apply_starting_with].end == newest_snap:
                    print "branch 1"
                    # end of a block in the optimal sequence is the newest snapshot; in this case,
                    # this must be the last step in the optimal sequence, or we would have exited
                    # in the above if.  So there is nothing to apply.
                    return
                elif streams[apply_starting_with].start < newest_snap and streams[apply_starting_with].end > newest_snap:
                    print "branch 2"
                    rollback_to -= 1
                    newest_snap = snaps[rollback_to-1]
                else:
                    print "branch 3"
                    apply_starting_with -= 1

        log("apply_starting_with = %s"%apply_starting_with)
        log("rollback_to = %s"%rollback_to)


        # streams that need to be applied
        streams = streams[apply_starting_with:]
        if len(streams) == 0:
            log("no streams need to be applied")
            return

        if rollback_to == 0:
            # have to delete them all
            self.destroy_image_fs()
        elif rollback_to < len(snaps):
            log("rollback the image file system -- removing %s snapshots"%(len(snaps[rollback_to-1:])))
            cmd("sudo /sbin/zfs rollback -r %s@%s"%(self.image_fs, snaps[rollback_to-1]))

        log("now applying %s incoming streams"%len(streams))
        for stream in streams:
            stream.apply()


    def send_streams(self):
        """
        Snapshot image filesystem, and update corresponding streams.
        """
        log = self._log("send_streams")
        sync()
        end = now()

        log("snapshotting image filesystem %s"%end)
        e = cmd("sudo /sbin/zfs snapshot %s@%s"%(self.image_fs, end), ignore_errors=True)
        if e:
            if 'dataset does not exist' in e:
                # not mounted -- nothing to do
                return
            else:
                raise RuntimeError(e)


        v = self.streams()
        log("there are %s streams already"%len(v))

        # We locate the newest snapshot that we have in our image_fs
        # such that there is also a stream that ends there,
        # which isn't too small. Then send starting from that point.
        snaps = snapshots(self.image_fs)
        big_stream_ends = set([x.end for x in v if x.size_mb() >= self.stream_thresh_mb])
        start = end
        for snap in reversed(snaps):
            if snap in big_stream_ends:
                # a stream ends here and this is newest.
                start = snap
                break
        if start == end:
            snap = "%s@%s"%(self.image_fs, end)
        else:
            snap = " -i %s@%s %s@%s"%(self.image_fs, start, self.image_fs, end)

        target = os.path.join(self.stream_path, "%s--%s"%(start, end))
        try:
            log("sending new stream: %s"%target)
            try:
                out = cmd("sudo /sbin/zfs send -Dv %s | lz4c - > %s.partial && mv %s.partial %s"%(snap, target, target, target))
                if 'does not exist' in out:  # does not result in nonzero error code, due to use of streams
                    raise RuntimeError(out)
            except:
                os.unlink("%s.partial"%target)
                raise
            # Now discard any streams we no longer need...
            for x in v:
                if x.start != x.end:
                    if x.start >= start:
                        log("discarding old stream: %s"%x.path)
                        os.unlink(x.path)
                elif start == end and x.start < start:
                    log("discarding old initial stream: %s"%x.path)
                    os.unlink(x.path)
        except RuntimeError:
            log("problem sending stream -- don't leave a broken stream around")
            try:
                os.unlink(target)
            except: pass
            try:
                os.unlink(target+'.partial')
            except: pass
            raise

    def snapshot_pool(self, name=''):
        """
        Snapshot with the current time if name='', else the given name.

        The project must be mounted.
        """
        if not name:
            name = now()
        log = self._log("snapshot_pool")
        cmd(["sudo", "zfs", "snapshot", "%s@%s"%(self.project_pool, name)])

    def destroy_snapshot_of_pool(self, name):
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
        log("chowning /%s to salvus user in case stream fs owned by root"%self.image_fs)
        cmd("sudo /bin/chown -R %s:%s /%s"%(os.getuid(), os.getgid(), self.image_fs))

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
        cmd("sudo /sbin/zpool add %s %s"%(self.project_pool, u))

    def close(self, kill=None, send_streams=True):
        """
        send_streams (if send_streams is true), unmount, then destroy image filesystem, leaving only streams.

        Dangeorus with send_streams=False.
        """
        if kill is None:
            kill = self._kill
        log = self._log("close")
        self.export_pool(kill=kill)
        if send_streams:
            self.send_streams()
        self.umount_image_fs()
        self.destroy_image_fs()

    def replicate(self, target, delete=False):
        """
        Replicate the streams for this project from this node to the given target.

        The stream paths have to be identical on the source and target machines.

        - target -- target computer

        - delete -- boolean (default: False); if true, deletes any files on target not here. DANGEROUS!
        """
        cmd("rsync -axvH %s %s/ %s:%s/"%('--delete' if delete else '', self.stream_path, target, self.stream_path))

    def destroy_image_fs(self,kill=None):
        """
        Destroy the image filesystem.
        """
        if kill is None:
            kill = self._kill
        log = self._log("destroy_image_fs")
        if self.is_project_pool_imported():
            self.export_pool(kill=kill)
        e = cmd("sudo /sbin/zfs destroy -r %s"%self.image_fs, ignore_errors=True)
        if e and 'dataset does not exist' not in e:
            raise RuntimeError(e)

    def destroy_streams(self):
        """
        Destroy all the streams associated to this project.
        """
        log = self._log("destroy_streams")
        log("removing the entire directory tree: '%s'"%self.stream_path)
        shutil.rmtree(self.stream_path)

    def destroy(self,kill=None):
        """
        Delete all traces of this project from this machine.  *VERY DANGEROUS.*
        """
        if kill is None:
            kill = self._kill
        self.umount(kill=kill)
        self.destroy_image_fs()
        self.destroy_streams()


    # NOTE -- all migrate stuff must be run as root. #

    def _create_migrate_user(self):
        u = self.uid
        username = 'migrate%s'%u
        self._delete_migrate_user()
        cmd('sudo /usr/sbin/groupadd -g %s -o %s'%(u,username))
        cmd('sudo /usr/sbin/useradd -u %s -g %s -o %s'%(u,u,username))
        return username

    def _delete_migrate_user(self):
        u = self.uid
        username = 'migrate%s'%u
        cmd('sudo /usr/sbin/userdel %s; sudo /usr/sbin/groupdel %s'%(username, username), ignore_errors=True)

    def migrate(self):
        """
        Create the project with the appropriate quota, then migrate over all snapshots.
        Assumes the project has not already been created.
        """
        log = self._log("migrate")
        log("figure out original quota")
        quota = cmd("sudo /sbin/zfs get -H quota projects/%s"%self.project_id).split()[2]
        self.create(quota)
        log("now migrate all snapshots")
        n = self.migrate_snapshots()
        log("migrated %s snapshots"%n)
        log("done -- now close the project")
        self.close(kill=False, send_streams=n>0)

    def migrate_snapshots(self, snapshot=None):
        """
        Copy over the given snapshot from the old project, and also make the current live
        contents of this project equal to that snapshot.

        If snapshot is not given, copy over in order all snapshots we don't currently have.
        In that case, it returns the number of copied snapshots.

        We use this only to migrate from the old to the new format.
        """
        if snapshot is not None:
            log = self._log("migrate_snapshots", snapshot=snapshot)
        else:
            log = self._log("migrate_snapshots")

        self.import_pool()
        fs = 'projects/%s'%self.project_id
        mount('/' + fs, fs)

        def setup_user():
            global passwd
            username = self._create_migrate_user()
            alpha = string.lowercase + string.digits
            passwd = ''.join([random.choice(alpha) for _ in range(16)])
            passwd_file = os.path.join(os.environ['HOME'], username)
            open(passwd_file,'w').write(passwd+'\n'+passwd)
            cmd("cat %s | sudo /usr/bin/passwd %s"%(passwd_file, username))
            return username, passwd_file

        def do_sync(username, passwd_file, snapshot):
            cmd("sshpass -f %s sudo /usr/bin/rsync -axH --delete /%s/.zfs/snapshot/%s/ %s@localhost:%s/"%(
                                         passwd_file, fs, snapshot, username, self.project_mnt))
            self.snapshot_pool(snapshot)

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
                return 0
            tm = time.time()
            username, passwd_file = setup_user()
            recent_times = []
            for snapshot in todo:
                if len(recent_times)>0:
                    time_per = sum(recent_times)/len(recent_times)
                    tr = (time_per * (len(todo)-i+1))/60.0
                else:
                    tr = 999999
                log("migrating missing snapshot (%s/%s) --  time remaining: %.1f minutes: %s"%(
                              i, len(todo), tr, snapshot))
                tm0 = time.time()
                do_sync(username, passwd_file, snapshot)
                recent_times.append(time.time() - tm0)
                if len(recent_times) > 10:
                    del recent_times[0]
                i += 1

            remove_user(passwd_file)
            return len(todo)
        else:
            username, passwd_file = setup_user()
            do_sync(username, passwd_file, snapshot)
            remove_user(passwd_file)


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="SMC project storage system")
    subparsers = parser.add_subparsers(help='sub-command help')


    parser.add_argument("project_id", help="project id", type=str)

    parser.add_argument("--pool", help="ZFS pool (default:'storage')", default="storage", type=str)
    parser.add_argument("--mnt", help="mountpoint for the project (default:'/projects/[project_id]')", default="", type=str)
    parser.add_argument("--login_shell", help="the login shell used when creating user (default:'/bin/bash')", default="/bin/bash", type=str)
    parser.add_argument("--stream_path", help="directory where streams are stored for this project(default: '/[pool]/streams/[project_id]')", default="", type=str)

    parser_create = subparsers.add_parser('create', help='create filesystem')
    parser_create.add_argument("--quota", dest="quota", help="disk quota (default: '%s')"%DEFAULT_QUOTA, type=str, default=DEFAULT_QUOTA)
    parser_create.set_defaults(func=lambda args: project.create(quota=args.quota))

    parser_umount = subparsers.add_parser('umount', help='unmount filesystem')
    parser_umount.add_argument("--kill", help="kill all processes by user first",
                                   dest="kill", default=None, action="store_const", const=True)
    parser_umount.set_defaults(func=lambda args: project.umount(kill=args.kill))

    parser_import_pool = subparsers.add_parser('import_pool', help='import the zpool from the images in the image filesystem and mount it')
    parser_import_pool.set_defaults(func=lambda args: project.import_pool())

    parser_export_pool = subparsers.add_parser('export_pool', help='export the zpool')
    parser_export_pool.add_argument("--kill", help="kill all processes by user first",
                                   dest="kill", default=None, action="store_const", const=True)
    parser_export_pool.set_defaults(func=lambda args: project.export_pool(kill=args.kill))

    parser_recv_streams = subparsers.add_parser('recv_streams', help='receive any streams that have not yet been applied to the image filesystem; error if zpool is mounted')
    parser_recv_streams.set_defaults(func=lambda args: project.recv_streams())

    parser_send_streams = subparsers.add_parser('send_streams', help='updates streams to reflect state of image filesystem')
    parser_send_streams.set_defaults(func=lambda args: project.send_streams())

    parser_replicate = subparsers.add_parser('replicate', help='directly send streams to another host via rsync (instead of database)')
    parser_replicate.add_argument("--delete", help="deletes any files on target not here (DANGEROUS); off by default",
                                   dest="delete", default=False, action="store_const", const=True)
    parser_replicate.add_argument("target", help="target hostname", type=str)
    parser_replicate.set_defaults(func=lambda args: project.replicate(args.target, delete=args.delete))

    parser_close = subparsers.add_parser('close', help='send_streams, unmount, destroy images, etc., leaving only streams')
    parser_close.add_argument("--nosend_streams", help="if given, don't send_streams first: DANGEROUS", default=False, action="store_const", const=True)
    parser_close.add_argument("--kill", help="kill all processes by user first",
                                   dest="kill", default=None, action="store_const", const=True)
    parser_close.set_defaults(func=lambda args: project.close(send_streams=not args.nosend_streams, kill=args.kill))

    parser_destroy = subparsers.add_parser('destroy', help='Delete all traces of this project from this machine.  *VERY DANGEROUS.*')
    parser_destroy.add_argument("--kill", help="kill all processes by user first",
                                   dest="kill", default=None, action="store_const", const=True)
    parser_destroy.set_defaults(func=lambda args: project.destroy(kill=args.kill))

    parser_destroy_image_fs = subparsers.add_parser('destroy_image_fs', help='export project pool and destroy the image filesystem, leaving only streams')
    parser_destroy_image_fs.add_argument("--kill", help="kill all processes by user first",
                                   dest="kill", default=None, action="store_const", const=True)
    parser_destroy_image_fs.set_defaults(func=lambda args: project.destroy_image_fs(kill=args.kill))

    parser_destroy_streams = subparsers.add_parser('destroy_streams', help='destroy all streams stored locally')
    parser_destroy_streams.set_defaults(func=lambda args: project.destroy_streams())

    parser_snapshot_pool = subparsers.add_parser('snapshot_pool', help='snapshot the project zpool')
    parser_snapshot_pool.add_argument("--name", dest="name", help="name of snapshot (default: ISO date)", type=str, default='')
    parser_snapshot_pool.set_defaults(func=lambda args: project.snapshot_pool(args.name))

    parser_destroy_snapshot_of_pool = subparsers.add_parser('destroy_snapshot_of_pool', help='destroy a snapshot of the project pool')
    parser_destroy_snapshot_of_pool.add_argument("--name", dest="name", help="name of snapshot", type=str)
    parser_destroy_snapshot_of_pool.set_defaults(func=lambda args: project.destroy_snapshot_of_pool(args.name))

    parser_snapshots = subparsers.add_parser('snapshots', help='show list of snapshots of the given project pool (JSON)')
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
        args.mnt = '/' + os.path.join('projects', args.project_id)
    if not args.stream_path:
        args.stream_path = '/' + os.path.join(args.pool, 'streams', args.project_id)

    t0 = time.time()
    project = Project(project_id  = args.project_id,
                      mnt         = args.mnt,
                      pool        = args.pool,
                      login_shell = args.login_shell,
                      stream_path = args.stream_path)
    args.func(args)
    log("total time: %s seconds"%(time.time()-t0))

