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



"""

# The salvus use that sues this script must have visudo setup like this:

salvus ALL=(ALL) NOPASSWD: /sbin/zfs *
salvus ALL=(ALL) NOPASSWD: /sbin/zpool *
salvus ALL=(ALL) NOPASSWD: /usr/bin/pkill *
salvus ALL=(ALL) NOPASSWD: /usr/bin/passwd *
salvus ALL=(ALL) NOPASSWD: /usr/sbin/groupadd *
salvus ALL=(ALL) NOPASSWD: /usr/sbin/useradd *
salvus ALL=(ALL) NOPASSWD: /usr/sbin/groupdel *
salvus ALL=(ALL) NOPASSWD: /usr/sbin/userdel *
salvus ALL=(ALL) NOPASSWD: /bin/chown *
salvus ALL=(ALL) NOPASSWD: /bin/chmod *
salvus ALL=(ALL) NOPASSWD: /usr/local/bin/compact_zvol *
salvus ALL=(ALL) NOPASSWD: /usr/local/bin/ensure_ssh_access.py *
salvus ALL=(ALL) NOPASSWD: /usr/local/bin/ensure_file_exists.py *
salvus ALL=(ALL) NOPASSWD: /usr/local/bin/cgroup.py *
salvus ALL=(ALL) NOPASSWD: /bin/ln *

Here compact_zvol is the little script:

#!/bin/sh
dd if=/dev/zero of=$1 bs=8M; rm $1

# While migrating, we also need all the following.  REMOVE these from visudo after migration.

salvus ALL=(ALL) NOPASSWD: /bin/su *
salvus ALL=(ALL) NOPASSWD: /bin/cp *
salvus ALL=(ALL) NOPASSWD: /bin/rm *


"""

# Default amount of disk space
DEFAULT_QUOTA      = '5G'

# Default cap on amount of RAM in Gigbaytes
DEFAULT_MEMORY_G   = 8

# Default share of the CPU
DEFAULT_CPU_SHARES = 256

# Cap on number of simultaneous cores
DEFAULT_CORE_QUOTA = 2   # -1=no limit; 2 = up to two cores





STREAM_EXTENSION = '.zvol.lz4'

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

def sync():
    print("syncing file system")
    cmd("sync")

def filesystem_exists(fs):
    try:
        cmd("sudo /sbin/zfs list %s"%fs)
        return True
    except:
        return False

def filesystem_size_b(fs):
    """
    Return the size of the filesystem in bytes.
    """
    return int(cmd("sudo /sbin/zfs get volsize -Hp %s"%fs).split()[2])

def filesystem_size(fs):
    """
    Return the size of the filesystem as a human-readable string returned by ZFS.
    """
    return cmd("sudo /sbin/zfs get volsize -H %s"%fs).split()[2]

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
        self.start, self.end = self.filename.split('.')[0].split('--')   # [date]--[date].zvol.lz4

    def __repr__(self):
        return "Stream(%s): %s to %s stored in %s"%(self.project.project_id, self.start, self.end, self.path)

    def __cmp__(self, other):
        return cmp((self.end, self.start), (other.end, other.start))

    def size_mb(self):
        return int(os.path.getsize(self.path)/1e6)

    def apply(self):
        """
        Apply this stream to the zvol for this project.
        """
        if self.project.project_pool_is_imported():
            raise RuntimeError("cannot receive stream while pool already imported")
        cmd("cat '%s' | lz4c -d - | sudo /sbin/zfs recv -F %s"%(self.path, self.project.zvol_fs))

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
            self._is_new = True
        else:
            self._is_new = False
        if uuid.UUID(project_id).get_version() != 4:
            raise RuntimeError("invalid project uuid='%s'"%project_id)
        self.project_id = project_id
        self.pool = pool
        self.uid = uid(project_id)
        self.stream_path = stream_path
        if not os.path.exists(self.stream_path):
            os.makedirs(self.stream_path)
        self.zvol_fs = os.path.join(self.pool, 'zvols', project_id)
        self.zvol_dev = os.path.join('/dev/zvol/', self.zvol_fs)
        self.project_pool = "projects-%s"%self.project_id
        self.project_mnt  = mnt
        self.uid = uid(project_id)
        self.stream_thresh_mb = 10
        self.username = self.project_id.replace('-','')
        self.login_shell = login_shell
        self.sagemathcloud_base_fs = os.path.join(self.pool, 'sagemathcloud')
        self.sagemathcloud_template_fs = os.path.join(self.sagemathcloud_base_fs, 'template')
        self.sagemathcloud_fs = os.path.join(self.sagemathcloud_base_fs, project_id)

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
        log("create new sparse zvol POOL/zvols/project_id (error if it exists already)")
        cmd("sudo /sbin/zfs create -V %s -s %s"%(quota, self.zvol_fs))
        cmd("sudo /sbin/zfs set sync=disabled %s"%self.zvol_fs)  # CRITICAL to set sync=disabled -- or it is a million times slower
        log("create a pool on the zvol")
        cmd("sudo /sbin/zpool create %s -m '%s' %s"%(self.project_pool, self.project_mnt, self.zvol_dev))
        cmd("sudo /sbin/zfs set compression=lz4 %s"%self.project_pool)
        cmd("sudo /sbin/zfs set dedup=off %s"%self.project_pool)  # dedup (even locally) may be evil!
        cmd("sudo /bin/chown %s:%s %s"%(self.uid, self.uid, self.project_mnt))
        cmd("sudo /bin/chmod og-rwx %s"%self.project_mnt)

        #os.chown(self.project_mnt, self.uid, self.uid)

    def umount(self):
        """
        Unmount the given project.
        """
        self.export_pool()

    def project_pool_is_imported(self):
        s = cmd("sudo /sbin/zpool list %s"%self.project_pool, ignore_errors=True)
        if 'no such pool' in s:
            return False
        elif 'ONLINE' in s:
            return True
        else:
            raise RuntimeError(s)

    def import_pool(self):
        """
        Import the zpool from the zvol and mount it.
        """
        log = self._log("import_pool")
        if len(optimal_stream_sequence(self.streams())) == 0 and not filesystem_exists(self.zvol_fs):
            log("no streams and no zvol, so just create a new empty pool.")
            self.create(DEFAULT_QUOTA)
            if self._is_new:
                self.create_user()
            return
        if not self.project_pool_is_imported():
            log("project pool not imported, so receiving streams")
            self.recv_streams()
            log("now importing project pool which is at /%s"%self.zvol_dev)
            cmd("sudo /sbin/zpool import -fN %s"%self.project_pool)
        log("setting mountpoint to %s"%self.project_mnt)
        mount(self.project_mnt, self.project_pool)
        if self._is_new:
            self.create_user()

    def kill(self, grace_s=0.25):
        log("killing all processes by user with id %s"%self.uid)
        MAX_TRIES=10
        for i in range(MAX_TRIES):
            cmd("sudo /usr/bin/pkill -u %s; sleep %s; sudo /usr/bin/pkill -9 -u %s"%(self.uid, grace_s, self.uid), ignore_errors=True)
            n = self.num_procs()
            log("kill attempt left %s procs"%n)
            if n == 0:
                break

    def pids(self):
        return [int(x) for x in cmd("pgrep -u %s"%self.uid, ignore_errors=True).replace('ERROR','').split()]

    def num_procs(self):
        return len(self.pids())

    def export_pool(self):
        """
        Export the zpool.
        """
        log = self._log("umount")
        log("exporting project pool")
        self.kill()
        e = cmd("sudo /sbin/zpool export %s"%self.project_pool, ignore_errors=True)
        if e and 'no such pool' not in e:
            raise RuntimeError(e)
        if self._is_new:
            self.delete_user()
        self.destroy_sagemathcloud_fs()

    def streams(self):
        """
        Return sorted list of the streams for this project.
        """
        log = self._log("streams")
        log("getting streams from %s"%self.stream_path)
        v = []
        for x in os.listdir(self.stream_path):
            if x.endswith(STREAM_EXTENSION):
                v.append(Stream(self, os.path.join(self.stream_path, x)))
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
        if self.project_pool_is_imported():
            raise RuntimeError('cannot recv streams since project pool is already imported')
        snaps   = snapshots(self.zvol_fs)
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
                if streams[apply_starting_with].start == newest_snap:
                    # apply starting here
                    break
                elif streams[apply_starting_with].end == newest_snap:
                    # end of a block in the optimal sequence is the newest snapshot; in this case,
                    # this must be the last step in the optimal sequence, or we would have exited
                    # in the above if.  So there is nothing to apply.
                    return
                elif streams[apply_starting_with].start < newest_snap and streams[apply_starting_with].end > newest_snap:
                    rollback_to -= 1
                    newest_snap = snaps[rollback_to-1]
                else:
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
            self.destroy_zvol_fs()
        elif rollback_to < len(snaps):
            log("rollback the image file system -- removing %s snapshots"%(len(snaps[rollback_to-1:])))
            cmd("sudo /sbin/zfs rollback -r %s@%s"%(self.zvol_fs, snaps[rollback_to-1]))

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
        e = cmd("sudo /sbin/zfs snapshot %s@%s"%(self.zvol_fs, end), ignore_errors=True)
        if e:
            if 'dataset does not exist' in e:
                # not mounted -- nothing to do
                return
            else:
                raise RuntimeError(e)


        v = self.streams()
        log("there are %s streams already"%len(v))

        # We locate the newest snapshot that we have in our zvol_fs
        # such that there is also a stream that ends there,
        # which isn't too small. Then send starting from that point.
        snaps = snapshots(self.zvol_fs)
        big_stream_ends = set([x.end for x in v if x.size_mb() >= self.stream_thresh_mb])
        start = end
        for snap in reversed(snaps):
            if snap in big_stream_ends:
                # a stream ends here and this is newest.
                start = snap
                break
        if start == end:
            snap = "%s@%s"%(self.zvol_fs, end)
        else:
            snap = " -i %s@%s %s@%s"%(self.zvol_fs, start, self.zvol_fs, end)

        target = os.path.join(self.stream_path, "%s--%s%s"%(start, end, STREAM_EXTENSION))
        try:
            log("sending new stream: %s"%target)
            try:
                out = cmd("sudo /sbin/zfs send -v %s | lz4c - > %s.partial && mv %s.partial %s"%(snap, target, target, target))
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
        if not amount.endswith('G'):
            raise RuntimeError("amount must be of the form '[number]G'")
        log("expanding the zvol by size %s"%amount)
        size = filesystem_size(self.zvol_fs)
        if not size.endswith("G"):
            raise NotImplementedError("filesystem size must end in G")
        # never shrink, which would *destroy the pool horribly!*
        new_size = int(math.ceil(float(amount[:-1]) + float(size[:-1])))
        cmd("sudo /sbin/zfs set volsize=%sG %s"%(new_size, self.zvol_fs))
        e = cmd("sudo /sbin/zpool online -e %s %s"%(self.project_pool, self.zvol_dev), ignore_errors=True)
        if 'ERROR' not in e:
            return
        if 'no such device in pool' in e:
            # sometimes the zvol_dev is required and sometimes the actual device name; I don't know how to tell which.
            cmd("sudo /sbin/zpool online -e %s %s"%(self.project_pool, self.zvol_device_name()))
        else:
            raise RuntimeError(e)

    def zvol_device_name(self):
        return os.path.split(os.readlink(self.zvol_dev))[-1]

    def compact_zvol(self):
        """
        This takes "about 10-15 seconds per gigabyte".
         1. *ensure* that compression is enabled on the pool that contains the zvol but not on the
            pool that is live on the zvol!
         2. Inside the mounted zpool do this:  "dd if=/dev/zero of=MYFILE bs=1M; rm MYFILE"
         3. We will only do this shrinking rarely, when doing a save *and* the size of the user's
            zpool is (significantly) smaller than the zvol.  It only takes about 5s/gb.
            We'll disable compression, do the shrink, then re-enable compression.
            This isn't the worst trick ever.
        Discussion here: http://comments.gmane.org/gmane.os.solaris.opensolaris.zfs/35630
        """
        tmp = None
        try:
            cmd("sudo /sbin/zfs set compression=off %s"%self.project_pool)
            cmd("sudo /sbin/zfs set dedup=off %s"%self.project_pool)
            tmp = os.path.join(self.project_mnt, "." + str(uuid.uuid4()))
            #cmd("dd if=/dev/zero of='%s' bs=8M"%tmp, ignore_errors=True)   # this *will* error when we run out of space
            cmd("sudo /usr/local/bin/compact_zvol %s"%tmp, ignore_errors=True)
        finally:
            cmd("sudo /sbin/zfs set compression=lz4 %s"%self.project_pool)
            cmd("sudo /sbin/zfs set dedup=on %s"%self.project_pool)

    def close(self, send_streams=True):
        """
        send_streams (if send_streams is true), unmount, then destroy image filesystem, leaving only streams.

        VERY Dangeorus with send_streams=False.
        """
        log = self._log("close")
        self.umount()
        if send_streams:
            self.send_streams()
        self.destroy_zvol_fs()
        self.destroy_sagemathcloud_fs()

    def replicate(self, target, delete=False):
        """
        Replicate the streams for this project from this node to the given target.

        The stream paths have to be identical on the source and target machines.

        - target -- target computer

        - delete -- boolean (default: False); if true, deletes any files on target not here. DANGEROUS!
        """
        cmd("rsync -axH %s %s/ %s:%s/"%('--delete' if delete else '', self.stream_path, target, self.stream_path))

    def destroy_zvol_fs(self):
        """
        Destroy the zvol.
        """
        log = self._log("destroy_zvol_fs")
        if self.project_pool_is_imported():
            self.export_pool()
        e = cmd("sudo /sbin/zfs destroy -r %s"%self.zvol_fs, ignore_errors=True)
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
        self.destroy_zvol_fs()
        self.destroy_streams()
        self.destroy_sagemathcloud_fs()

    def update_sagemathcloud_template(self):
        log = self._log('update_sagemathcloud_template')

        log("check if filesystem exists")
        if not filesystem_exists(self.sagemathcloud_base_fs):
            log('does not exist -- creating ')
            cmd("sudo /sbin/zfs create %s"%self.sagemathcloud_base_fs)
            cmd("sudo /sbin/zfs create %s"%self.sagemathcloud_template_fs)
        elif not filesystem_exists(self.sagemathcloud_template_fs):
            log('template does not exists so creating just it')
            cmd("sudo /sbin/zfs create %s"%self.sagemathcloud_template_fs)

        log("mounting template")
        cmd("sudo /sbin/zfs set mountpoint=/%s %s; sudo /sbin/zfs mount %s"%(
             self.sagemathcloud_template_fs, self.sagemathcloud_template_fs, self.sagemathcloud_template_fs),
            ignore_errors=True)

        log("setting template owner to salvus")
        cmd("sudo /bin/chown salvus. /%s"%self.sagemathcloud_template_fs)

        log("rsync'ing over updated template... (this should take about a minute the first time)")
        cmd("rsync -axHL --delete %s/ /%s/"%(SAGEMATHCLOUD_TEMPLATE, self.sagemathcloud_template_fs))
        log("taking a snapshot of the template")
        cmd("sudo /sbin/zfs snapshot %s@%s"%(self.sagemathcloud_template_fs, now()))

    def newest_sagemathcloud_template_snapshot(self):
        log = self._log('newest_sagemathcloud_template_snapshot')
        log('check if exists')
        if not filesystem_exists(self.sagemathcloud_template_fs):
            self.update_sagemathcloud_template()
        log('get directory listing')
        v = os.listdir(os.path.join('/'+self.sagemathcloud_template_fs, '.zfs', 'snapshot'))
        v.sort()
        return v[-1]

    def update_sagemathcloud_fs(self):
        log = self._log('update_sagemathcloud_fs')
        log('ensure sagemathcloud_fs exists')
        if not filesystem_exists(self.sagemathcloud_fs):
            self.create_sagemathcloud_fs()
        else:
            log('get latest snapshot')
            snap = self.newest_sagemathcloud_template_snapshot()
            log('make sure we can ssh in')
            self.ensure_ssh_access()
            log('rsync over files')
            cmd("rsync -axH  /%s/.zfs/snapshot/%s/ %s@localhost:/%s/"%(self.sagemathcloud_template_fs, snap, self.username, self.sagemathcloud_fs))

    def create_sagemathcloud_fs(self):
        """
        Setup the ~/.sagemathcloud directory for this project.
        If the project pool is not imported it will be.
        """
        log = self._log('create_sagemathcloud_fs')
        log('ensure user/pool exist and imported')
        if not self.project_pool_is_imported():
            self.import_pool()
        log('make sure the sagemathcloud fs exists')
        if not filesystem_exists(self.sagemathcloud_fs):
            snap = self.newest_sagemathcloud_template_snapshot()
            cmd("sudo /sbin/zfs clone %s@%s %s"%(self.sagemathcloud_template_fs, snap, self.sagemathcloud_fs))
            cmd("sudo /sbin/zfs set quota=256M %s"%self.sagemathcloud_fs)
            cmd("sudo /bin/chown -R %s. /%s"%(self.username, self.sagemathcloud_fs))
        log('create the symlink')
        cmd("sudo /bin/ln -sf /%s %s/.sagemathcloud"%(self.sagemathcloud_fs, self.project_mnt))

    def destroy_sagemathcloud_fs(self):
        log = self._log('destroy_sagemathcloud_fs')
        log('destroying')
        cmd("sudo /sbin/zfs destroy -r %s"%self.sagemathcloud_fs, ignore_errors=True)  # error if doesn't exist or user on it.

    def ensure_ssh_access(self):
        log = self._log('ensure_ssh_access')
        log("first check that pool is imported")
        if not self.project_pool_is_imported():
            self.import_pool()
        log("now make sure .ssh/authorized_keys file good")
        cmd("sudo /usr/local/bin/ensure_ssh_access.py %s %s"%(self.project_mnt, SSH_ACCESS_PUBLIC_KEY))
        cmd("sudo /usr/local/bin/ensure_file_exists.py %s %s/.bashrc"%(BASHRC_TEMPLATE, self.project_mnt))
        cmd("sudo /usr/local/bin/ensure_file_exists.py %s %s/.bash_profile"%(BASH_PROFILE_TEMPLATE, self.project_mnt))

    def cgroup(self, memory_G, cpu_shares, core_quota):
        log = self._log('cgroup')
        log("configuring cgroups...")
        if core_quota <= 0:
            cfs_quota = -1
        else:
            cfs_quota = int(100000*core_quota)
        cmd("sudo /usr/local/bin/cgroup.py %s %s %s %s"%(self.username, memory_G, cpu_shares, cfs_quota))


    def migrate_from(self, host):
        if not host:
            raise ValueError("must provide the host")
        self.create_user()
        log = self._log("migrate_from")

        timeout = 60
        try:
            log('temporary ssh')
            cmd("sudo /bin/cp -r /home/salvus/.ssh %s/"%self.project_mnt)
            cmd("sudo /bin/chown -R %s %s/.ssh"%(self.username, self.project_mnt))
            src = "/projects/%s"%self.project_id

            def get_quota():
                log('get quota')
                try:
                    a = cmd("ssh %s 'df -h %s'"%(host, src), timeout=timeout).splitlines()[1].split()
                    quota      = a[1]
                    mountpoint = a[5]
                    if mountpoint != src:
                        # not mounted
                        return 0
                    if quota[-1] != 'G':
                        quota = DEFAULT_QUOTA
                    return max(2, math.ceil(float(quota[:-1])))
                except RuntimeError:
                    return 0

            we_mounted_it = False
            q = get_quota()
            if q == 0:
                # try to mount
                cmd('ssh %s "sudo zfs set mountpoint=/projects/%s projects/%s; sudo zfs mount projects/%s"'%(
                              host, self.project_id, self.project_id, self.project_id), timeout=timeout, ignore_errors=True)
                we_mounted_it = True
                q = get_quota()
                if q == 0:
                    raise RuntimeError("unable to mount remote filesystem and get quota")
                else:
                    we_mounted_it = True

            size = filesystem_size(self.zvol_fs)
            if not size.endswith("G"):
                raise NotImplementedError("filesystem size must end in G")
            s = math.ceil(float(size[:-1]))
            if s < q:
                log("increasing quota since %s < %s"%(s,q))
                self.increase_quota("%sG"%(q-s))

            log("doing rsync")
            rsync = 'rsync -axH --exclude .zfs --exclude .npm --exclude .sagemathcloud --exclude .node-gyp --exclude .cache --exclude .forever --exclude .ssh root@%s:/projects/%s/ /%s/'%(host, self.project_id, self.project_mnt)

            cmd("sudo /bin/su - %s -c '%s'"%(self.username, rsync), timeout=60*60)  # can't take more than an hour

            log("umounting")
            if we_mounted_it:
                umnt  = 'ssh %s "sudo zfs umount projects/%s"'%(host, self.project_id)
                cmd(umnt, ignore_errors=True, timeout=30)  # not a big deal if unmount isn't guaranteed

        finally:

            log("remove .ssh")
            cmd("sudo /bin/rm -rf %s/.ssh"%self.project_mnt)


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
    parser_umount.set_defaults(func=lambda args: project.umount())

    parser_import_pool = subparsers.add_parser('import_pool', help='import the zpool from the images in the image filesystem and mount it')
    parser_import_pool.set_defaults(func=lambda args: project.import_pool())

    parser_export_pool = subparsers.add_parser('export_pool', help='export the zpool')
    parser_export_pool.set_defaults(func=lambda args: project.export_pool())

    parser_recv_streams = subparsers.add_parser('recv_streams', help='receive any streams that have not yet been applied to the image filesystem; error if zpool is mounted')
    parser_recv_streams.set_defaults(func=lambda args: project.recv_streams())

    parser_send_streams = subparsers.add_parser('send_streams', help='updates streams to reflect state of image filesystem')
    parser_send_streams.set_defaults(func=lambda args: project.send_streams())

    parser_sagemathcloud = subparsers.add_parser('sagemathcloud', help='control the ~/.sagemathcloud filesystem (give either --create, --destroy or both)')
    parser_sagemathcloud.add_argument("--create", help="if given, create the .sagemathcloud filesystem", default=False, action="store_const", const=True)
    parser_sagemathcloud.add_argument("--destroy", help="if given, destroy the .sagemathcloud filesystem", default=False, action="store_const", const=True)
    parser_sagemathcloud.add_argument("--update", help="if given, update the .sagemathcloud filesystem in place using rsync from newest template (so no need to killall)", default=False, action="store_const", const=True)
    parser_sagemathcloud.add_argument("--update-template", dest='update_template', help="if given, update the template itself", default=False, action="store_const", const=True)
    def sagemathcloud(args):
        if args.update_template:
            project.update_sagemathcloud_template()
        if args.destroy:
            project.destroy_sagemathcloud_fs()
        if args.create:
            project.create_sagemathcloud_fs()
        if args.update:
            project.update_sagemathcloud_fs()
    parser_sagemathcloud.set_defaults(func=sagemathcloud)

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

    parser_destroy_sagemathcloud_fs = subparsers.add_parser('destroy_sagemathcloud_fs', help='destroy the ~/.sagemathcloud filesystem')
    parser_destroy_sagemathcloud_fs.set_defaults(func=lambda args: project.destroy_sagemathcloud_fs())

    parser_replicate = subparsers.add_parser('replicate', help='directly send streams to another host via rsync (instead of database)')
    parser_replicate.add_argument("--delete", help="deletes any files on target not here (DANGEROUS); off by default",
                                   dest="delete", default=False, action="store_const", const=True)
    parser_replicate.add_argument("target", help="target hostname", type=str)
    parser_replicate.set_defaults(func=lambda args: project.replicate(args.target, delete=args.delete))

    parser_close = subparsers.add_parser('close', help='send_streams, unmount, destroy images, etc., leaving only streams')
    parser_close.add_argument("--nosend_streams", help="if given, don't send_streams first: DANGEROUS", default=False, action="store_const", const=True)
    parser_close.set_defaults(func=lambda args: project.close(send_streams=not args.nosend_streams))

    parser_kill = subparsers.add_parser('kill', help='Kill all processes running as this user.')
    parser_kill.set_defaults(func=lambda args: project.kill())

    parser_destroy = subparsers.add_parser('destroy', help='Delete all traces of this project from this machine.  *VERY DANGEROUS.*')
    parser_destroy.set_defaults(func=lambda args: project.destroy())

    parser_destroy_zvol_fs = subparsers.add_parser('destroy_zvol_fs', help='export project pool and destroy the image filesystem, leaving only streams')
    parser_destroy_zvol_fs.set_defaults(func=lambda args: project.destroy_zvol_fs())

    parser_destroy_streams = subparsers.add_parser('destroy_streams', help='destroy all streams stored locally')
    parser_destroy_streams.set_defaults(func=lambda args: project.destroy_streams())

    parser_compact_zvol = subparsers.add_parser('compact_zvol', help='compact the zvol, so exporting it will take way less space in case it has blown up and shrunk -- would only make sense after deleting snapshots')
    parser_compact_zvol.set_defaults(func=lambda args: project.compact_zvol())

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

    parser_migrate_from = subparsers.add_parser('migrate_from', help='get content from')
    parser_migrate_from.add_argument("--host", dest="host", help="required hostname", type=str, default='')
    parser_migrate_from.set_defaults(func=lambda args: project.migrate_from(host=args.host))

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

