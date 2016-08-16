#!/usr/bin/env python2

# Installation is as follows.  However, this is all automated by the storage-daemon daemonset!  You don't
# do this manually.    Install as (yes, without the .py extension!)
#
#    /usr/libexec/kubernetes/kubelet-plugins/volume/exec/smc~smc-storage/smc-storage
#
# The minion node must also have ZFS installed (so, e.g,. `zpool list` works) and `bindfs` (for snapshots).
# All relevant install is done by the storage-daemon pods -- you do nothing manually.
#

import datetime, json, os, shutil, signal, socket, sys, time, uuid

LOCK_TIME_S = 120

HOSTNAME = socket.gethostname()

def LOG(*args):
    open("/var/log/smc-storage.log",'a').write(str(args)+'\n')

LOG('argsv', sys.argv)

def log(obj):
    LOG("Will return '%s'"%obj)
    print(json.dumps(obj, separators=(',', ':')))

alarm_time=0
def mysig(a,b):
    raise KeyboardInterrupt
def alarm(seconds):
    seconds = int(seconds)
    signal.signal(signal.SIGALRM, mysig)
    global alarm_time
    alarm_time = seconds
    signal.alarm(seconds)
def cancel_alarm():
    signal.signal(signal.SIGALRM, signal.SIG_IGN)

def cmd(s, timeout=20, verbose=False):
    if verbose:
        print(s)
    if isinstance(s, list):
        for i, x in enumerate(s):
            if len(x.split()) > 1:
                s[i] = "'%s'"%x
        s = ' '.join(s)
    try:
        alarm(timeout)
        LOG("cmd('%s')"%s)
        z = os.popen(s+" 2>&1 ")
        t = z.read()
        if z.close():
            raise RuntimeError(t)
        return t.strip()
    finally:
        cancel_alarm()

def init(args):
    LOG('init', args)
    return

def ensure_server_is_mounted(server, namespace):
    mnt = "/mnt/smc-storage/{namespace}/{server}".format(namespace = namespace, server = server)
    if not os.path.exists(mnt):
        os.makedirs(mnt)
    if not os.path.ismount(mnt):
        # We use sshfs instead of NFS, since sshfs is vastly more robust and will survive
        # ip changes (which will happen when storage servers get restarted/moved!),
        # whereas NFS is a nightmarish hell of locks and misery, which hardcodes ips in the mount table.
        # Also, obviously, using sshfs allows us to clarify security using a simple PKI.
        id_rsa = "/root/.ssh/smc-storage/{namespace}/id_rsa".format(namespace=namespace)
        cmd("sshfs -o Ciphers=arcfour128,reconnect,ServerAliveInterval=5,ServerAliveCountMax=5,nonempty,IdentityFile={id_rsa},StrictHostKeyChecking=no {namespace}-{server}: {mnt}".format(
                id_rsa    = id_rsa,
                server    = server,
                namespace = namespace,
                mnt       = mnt)
           )
    return mnt

def lock_filename(path):
    return os.path.join(path, 'lock')  # used elsewhere, e.g., in storage/images/backup/run.py

def check_for_lock(path):
    lockfile = lock_filename(path)
    if not os.path.exists(lockfile):
        # no lock
        return
    host = open(lockfile).read()
    if host == HOSTNAME:
        # we have the lock
        return
    age_s = time.time() - os.path.getmtime(lockfile)
    if age_s < LOCK_TIME_S:
        raise RuntimeError("'{path}' locked by {host}".format(path=path, host=host))

def write_lock_file(path):
    open(lock_filename(path),'w').write(HOSTNAME)

def remove_lock_file(path):
    LOG("remove_lock_file '%s'"%path)
    lockfile = lock_filename(path)
    if os.path.exists(lockfile):
        os.unlink(lockfile)

def update_all_locks(args):
    for k in cmd("zpool list -HvP -o name").splitlines():
        v = k.split()
        if len(v) > 1:
            path = os.path.split(v[0])[0]
            write_lock_file(path)

# Attach device to minion
def attach(args):
    LOG('attach', args)
    params = json.loads(args.json_params)

    path = params.get("path", None)
    if not path:
        raise RuntimeError("must specify path of the form path/to/foo.share, path/to/foo.ext4 path/to/foo.zfs")

    server = params.get("server", None)
    if not server:
        raise RuntimeError("must specify server 'ip_address:/path'")

    size = params.get("size", '')
    if not size:
        raise RuntimeError("size must be specified")

    namespace = params.get("namespace", '')
    if not namespace:
        raise RuntimeError("namespace must be explicitly specified")

    mount_point = ensure_server_is_mounted(server, namespace)
    path = os.path.join(mount_point, path)
    if not os.path.exists(path):
        os.makedirs(path)
    elif not os.path.isdir(path):
        os.unlink(path)
        os.makedirs(path)
    fs = os.path.splitext(path)[1][1:]
    if fs == 'zfs':
        check_for_lock(path)
        write_lock_file(path)
        return attach_zfs(path, size)
    elif fs in ['ext4', 'btrfs']:
        check_for_lock(path)
        write_lock_file(path)
        return attach_loop(path, size, fs)
    elif fs == 'share':
        return attach_share(path)
    else:
        raise ValueError("Unknown filesystem '%s'"%fs)

def size_to_bytes(size):
    size = size.lower().strip('b')
    if size.endswith('m'):
        size = int(round(float(size[:-1])*1048576))  # 1048576=1024**2
    elif size.endswith('g'):
        size = int(round(float(size[:-1])*1048576*1024))
    else:
        raise ValueError("size (='%s') must end in M or G"%size)
    return size

def attach_zfs(path, size):
    """
    - path -- (string) absolute path to directory that contains image file(s).
    - size -- (string) size of pool, e.g., '3G' or '3500M'
    """
    images = [os.path.join(path, x) for x in os.listdir(path) if x.endswith('.img')]
    pool_file = os.path.join(path, 'pool')
    if len(images) == 0 or not os.path.exists(pool_file):
        image = os.path.join(path, "00.img")
        cmd('truncate -s %s %s'%(size, image))
        pool = 'pool-' + str(uuid.uuid4())
        open(pool_file,'w').write(pool)
        cmd("zpool create %s -f %s"%(pool, image))
        cmd("zfs set compression=lz4 %s"%pool)
        cmd("zfs set dedup=on %s"%pool)
    else:
        pool = open(pool_file).read().strip()
    return {'device':pool}

def adjust_pool_size_if_necessary(path, requested_size, verbose=False):
    # CRITICAL: we assume the pool is imported in this function!
    images = [os.path.join(path, x) for x in os.listdir(path) if x.endswith('.img')]
    req_size_bytes = size_to_bytes(requested_size)
    cur_size_bytes = sum(os.stat(image).st_size for image in images)
    # NOTE: pool is *assumed* to be imported, so setting the quota should work.
    pool = open(os.path.join(path, 'pool')).read().strip()
    enlarged = 0
    while True:
        # keep trying to set quota until it works -- it can fail if the quota is less than
        # the actual used space, but that would lock out user, so we auto-enlarge.
        try:
            cmd("zfs set quota={req_size_bytes} {pool}".format(req_size_bytes=req_size_bytes, pool=pool), verbose=verbose)
            break
        except Exception as err:
            if 'size is less than' in str(err):
                # set quota to the current used space -- (yes, this would let a user
                # cheat a little... but we can have a strategy to warn them).
                if enlarged:
                    if enlarged > 30:
                        raise   # something just isn't working -- give up!
                    req_size_bytes = int(req_size_bytes * 1.1)
                else:
                    # I wish this worked and gave an amount that worked.. but it simply doesn't.
                    req_size_bytes = size_to_bytes(cmd("zpool list -H -o alloc {pool}".format(pool=pool), verbose=verbose)) + size_to_bytes('50M')
                enlarged += 1
                continue
            else:
                raise

    if req_size_bytes > cur_size_bytes:
        if verbose:
            print("increase the size of the pool")
        image = images[-1]
        amount_bytes = req_size_bytes - cur_size_bytes
        if verbose:
            print("will increase by %s bytes"%amount_bytes)
        new_size_bytes = amount_bytes + os.stat(image).st_size
        cmd("dd if=/dev/zero of={image} bs=1 count=0 seek={new_size_bytes}".format(
            image=image, new_size_bytes=new_size_bytes), verbose=verbose)
        cmd("zpool online -e {pool} {image}".format(pool=pool, image=image), verbose=verbose)
    # NOTE: the else condition, which would be to shrink the pool... is a no-op, since
    # we already set the quota above.

def zpool_resize(args):
    """
    Handle the command line resize subcommand.
    """
    path = args.path
    requested_size = args.size
    pool_file = os.path.join(path, 'pool')
    if not os.path.exists(pool_file):
        raise RuntimeError("no such file '%s'"%pool_file)
    adjust_pool_size_if_necessary(path, requested_size, verbose=not args.quiet)

def attach_loop(path, size, fs):
    images = [x for x in os.listdir(path) if x.endswith('.img')]
    if len(images) == 0:
        image = os.path.join(path, "00.img")
        cmd('truncate -s %s %s'%(size, image))
        if fs == 'ext4':
            cmd('yes | mkfs.ext4 -q %s >/dev/null 2>/dev/null'%image)
        elif fs == 'btrfs':
            cmd('mkfs.btrfs %s >/dev/null 2>/dev/null'%image)
        else:
            raise ValueError("unknown filesystem '%s'"%fs)
    else:
        image = os.path.join(path, images[0])
    try:
        device = cmd("losetup -v -f %s"%image).split()[-1]
    except Exception as err:
        if "could not find any free loop device" in str(err):
            # make a new loop device
            n = 8
            while os.path.exists('/dev/loop%s'%n):
                n += 1
            cmd("mknod -m 660 /dev/loop%s b 7 %s"%(n,n))
            device = cmd("losetup -v -f %s"%image).split()[-1]
    return {'device':device}

def attach_share(path):
    return {'device':path}

def get_pool(image_filename):
    t = cmd("zpool status")
    i = t.find(image_filename)
    if i == -1:
        raise RuntimeError("no such pool")
    j = t[:i].rfind('pool:')
    if j == -1:
        raise RuntimeError("no such pool")
    t = t[j:]
    i = t.find('\n')
    return t[:i].split(':')[1].strip()

def mount(args):
    LOG('mount', args)
    mount_dir  = args.mount_dir
    device     = args.device
    params     = json.loads(args.json_params)
    if not os.path.exists(mount_dir):
        os.makedirs(mount_dir)
    path       = params.get("path", None)
    if not path:
        raise RuntimeError("must specify path of the form path/to/foo.share, path/to/foo.ext4, path/to/foo.zfs")

    fs = os.path.splitext(path)[1][1:]
    if fs == 'zfs':
        server = params.get("server", None)
        if not server:
            raise RuntimeError("must specify server hostname")
        namespace = params.get("namespace", '')
        if not namespace:
            raise RuntimeError("namespace must be explicitly specified")
        size = params.get("size", '')
        if not size:
            raise RuntimeError("size must be specified")
        mount_point = ensure_server_is_mounted(server, namespace)
        path = os.path.join(mount_point, path)
        return mount_zfs(path, mount_dir, size, namespace)
    elif fs == 'ext4':
        cmd("mount %s %s"%(device, mount_dir))
    elif fs == 'btrfs':
        cmd("mount -o compress-force=lzo %s %s"%(device, mount_dir))
    elif fs == 'share':
        # For a share, the actual shared data is in the data/ subdirectory, so that
        # we can store other info in the .share directory, e.g., a bup archive.
        if not os.path.exists("%s/data"%device):
            os.makedirs("%s/data"%device)
        cmd("mount --bind %s/data %s"%(device, mount_dir))
    else:
        raise ValueError("Unknown filesystem '%s'"%fs)

def get_zfs_mountpoint(namespace, pool):
    return "/mnt/smc-storage/{namespace}/zfs/{pool}".format(namespace = namespace, pool=pool)

def mount_zfs(path, mount_dir, size, namespace):
    pool_file = os.path.join(path, 'pool')
    pool = open(pool_file).read().strip()
    try:
        cmd("zpool import %s -d %s"%(pool, path))
    except Exception as err:
        if 'give it a new name' not in str(err):
            raise

    adjust_pool_size_if_necessary(path, size)

    # Ensure that zfs pool is mounted in a known location.
    zfs_mount = get_zfs_mountpoint(namespace, pool)
    if cmd("zfs get -H -o value mountpoint %s"%pool) != zfs_mount:  # setting that won't change is still an error since it first unmounts
        cmd("zfs set mountpoint=%s %s"%(zfs_mount, pool))

    # Bindfs mount the zfs mount to the requested target.  CRITICAL: We do this rather than
    # just directly setting the zfs mountpoint, despite the performance penalty, since it
    # makes it massively faster to restart deployments, since we can mount before
    # unmounting.
    cmd("mount -o bind %s %s"%(zfs_mount, mount_dir))

    # Also bindfs (FUSE!) mount the snapshots, since otherwise new ones won't work in the container!
    snapshots = os.path.join(mount_dir, '.snapshots')
    if not os.path.exists(snapshots):
        os.makedirs(snapshots)
    # Make snapshots available in the container
    cmd("bindfs %s %s"%(os.path.join(mount_dir, '.zfs', 'snapshot'), snapshots))
    # Delete any image files that all laying around but not part of the pool.
    # These could get left when doing defrag in case of a timeout or loss of remote.
    zpool_delete_unused_images(path, verbose=False)

def unmount(args):
    LOG('unmount', args)
    mount_dir  = args.mount_dir
    if os.path.exists(mount_dir):
        snapshots = os.path.join(mount_dir, '.snapshots')
        if os.path.exists(snapshots) and os.path.ismount(snapshots):
            cmd("umount %s"%snapshots)
        device = cmd("df %s | tail -1"%mount_dir).split()[0]
        cmd("umount %s"%mount_dir)  # remove the **bind** mount.
        if device.startswith('pool-'):
            # try to remove zpool if no more mounts -- for some reason k8s doesn't call detach below...
            try:
                s = cmd("zpool list -HvP -o name {device}".format(device=device))
                img = s.split()[1]
                path = os.path.split(img)[0]
                cmd("zpool export %s"%device)
                # Nothing else using the pool; give up our lock
                remove_lock_file(path)
            except Exception as err:
                LOG("unmount", "can't export pool -- may be mounted by multiple containers: %s"%err)
                pass

def detach(args):
    LOG('detach', args)
    device = args.device
    if device.endswith('.share'):
        # nothing to detach
        return
    if device.startswith('/dev/loop'):
        # loopback device
        s = cmd("losetup %s"%device)
        path = os.path.split(s.split()[-1].strip('()'))[0]
        cmd("losetup -d %s"%device)
        remove_lock_file(path)
        return
    # ZFS -- export the pool
    s = cmd("zpool list -HvP -o name {device}".format(device=device))
    img = s.split()[1]
    path = os.path.split(img)[0]
    try:
        # This will fail if the zpool is in use by another container (e.g., during a restart)
        cmd("zpool export {device}".format(device=device))
        # Nothing else using the pool; give up our lock
        remove_lock_file(path)
    except:
        # Pool still in use...
        pass

def zpool_clear_errors(args):
    LOG("zpool_clear_errors")
    try:
        w = cmd("zpool status -xP|grep 'pool:'").splitlines()
    except:
        LOG("zpool_clear_errors -- no errors")
        return
    for k in w:
        v = k.split(':')
        if len(v) > 1:
            try:
                LOG("attempting to clear errors for %s"%v[1])
                cmd("zpool clear %s"%v[1])
            except Exception as err:
                LOG("failed to clear -- %r"%err)

#
# SNAPSHOT SUPPORT
#

def create_snapshot(pool, name):
    timestamp = time_to_timestamp()
    snapshot = "{timestamp}-{name}".format(timestamp=timestamp, name=name)
    cmd(['zfs', 'snapshot', "{pool}@{snapshot}".format(pool=pool, snapshot=snapshot)], timeout=3)
    return timestamp

def delete_snapshot(pool, snapshot):
    cmd(['zfs', 'destroy', "{pool}@{snapshot}".format(pool=pool, snapshot=snapshot)], timeout=3)

# Lengths of time in minutes.
SNAPSHOT_INTERVALS = {
    'five'    : 5,
    'hourly'  : 60,
    'daily'   : 60*24,
    'weekly'  : 60*24*7,
    'monthly' : 60*24*7*4
}

# How many of each type of snapshot to retain
SNAPSHOT_COUNTS = {
    'five'    : 12*6,   # 6 hours worth of five-minute snapshots
    'hourly'  : 24*7,   # 1 week of hourly snapshots
    'daily'   : 30,     # 1 month of daily snapshots
    'weekly'  : 8,      # 2 months of weekly snapshots
    'monthly' : 6       # 6 months of monthly snapshots
}

TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M%S"      # e.g., 2016-06-27-141131
TIMESTAMP_N = len("2016-06-27-141131")
def time_to_timestamp(tm=None):
    if tm is None:
        tm = time.time()
    return datetime.datetime.fromtimestamp(tm).strftime(TIMESTAMP_FORMAT)

def timestamp_to_time(timestamp):
    d = datetime.datetime.strptime(timestamp, TIMESTAMP_FORMAT)
    #return d.timestamp()  # python3
    return time.mktime(d.timetuple())

def update_snapshots(pool, snapshots):
    """
    Update the rolling ZFS snapshots on the given pool.

    If no files have changed since the most recent snapshot, do nothing.
    """
    # determine which snapshots we need to make
    now = time.time()
    newest_snaptime = None
    if len(snapshots) > 0:
        snapshots.sort()   # we assume snapshots are named so they sort in order
        if len(cmd(['zfs', 'diff', "{pool}@{snapshot}".format(pool=pool, snapshot=snapshots[-1])], verbose=False).splitlines()) == 0:
            # no files changed since last snapshot -- do nothing.
            return
    for name, interval in SNAPSHOT_INTERVALS.items():
        if SNAPSHOT_COUNTS[name] <= 0: # not making any of these
            continue
        # Is there a snapshot with the given name that is within the given
        # interval of now?  If not, make snapshot.
        v = [s for s in snapshots if s.endswith('-'+name)]
        if len(v) > 0:
            newest = v[-1]
            t = timestamp_to_time(newest[:TIMESTAMP_N])
            age_m = (now - t)/60.0   # age in minutes since snapshot
        else:
            age_m = 999999999999  # 'infinite'
        if age_m > interval:
            # make this snapshot
            newest_snaptime = create_snapshot(pool, name)
        # Are there too many snapshots of the given type?  If so, delete them:
        if len(v) > SNAPSHOT_COUNTS[name]:
            for s in v[ : len(v) - SNAPSHOT_COUNTS[name]]:
                delete_snapshot(pool, s)
    return newest_snaptime

def snapshot_info():

    # TODO: option to only include pools for which the image file has changed since last time we
    # made a snapshot.  Most pools probably sit unused.

    info = {}
    # Get all pools (some may not be in result of snapshot listing below!)
    for pool in cmd(['zfs', 'list', '-r', '-H', '-o', 'name']).split():
        info[pool] = []
    # Get snapshot info for *all* snapshots on all pools
    for snapshot in sorted(cmd(['zfs', 'list', '-r', '-H', '-t', 'snapshot', '-o', 'name']).split()):
        pool, snap = snapshot.split('@')
        info[pool].append(snap)
    return info

def zpool_update_snapshots(args):
    """
    Update the rolling ZFS snapshots on all mounted zpool's.
    """
    LOG("zpool_update_snapshots")
    new_snapshots = {}
    for pool, snaps in snapshot_info().items():
        try:
            new_snaptime = update_snapshots(pool, snaps)
            if new_snaptime is not None:
                project_id = pool_to_project_id(pool)
                new_snapshots[project_id] = new_snaptime
        except Exception as err:
            LOG("error updating snapshot of %s -- %r"%(pool, err))
    return {"new_snapshots":new_snapshots}

# TODO: it would be faster to do all the pool-->project_id computation in a single call to zpool status...
def pool_to_project_id(pool):
    """
    Given a mounted ZFS pool, return the corresponding project id, if there is one.
    This is just heuristically based on the path to the images, e.g., if it ends with
      .../projects/f8cf98ed-299e-4423-a167-870e8658e085.zfs/00.img
    then the project id is 'f8cf98ed-299e-4423-a167-870e8658e085'.

    Returns None if not a project.
    """
    s = cmd("zpool status -P {pool}".format(pool=pool))
    pattern = "/projects/"
    i = s.find(pattern)
    if i == -1:
        return None
    s = s[i+len(pattern):]
    i = s.find('.')
    if i == -1:
        return None
    return s[:i]


def zpool_status(pool):
    x = cmd("zpool status %s"%pool)
    d = {}
    while x:
        i = x.find(":")
        key = x[:i].strip()
        x = x[i+1:]
        j = x.find(":")
        if j == -1:
            val = x
            break
        else:
            j = x[:j].rfind('\n')
            val = x[:j]
            x = x[j+1:].strip()
        d[key] = val.strip()
    return d

def zpool_image_files(pool):
    status = zpool_status(pool)
    v = []
    for x in status['config'].splitlines():
        y = x.strip()
        if y.startswith('/'):
            v.append(y.split()[0])
    return v

def defragment_zfs_pool(path, verbose=True):
    """
    INPUT:

    - path -- (string) the full path to a directory that contains img file that define a ZFS pool.

    The pool must already be imported.
    """
    # Get info about the pool (will raise an error if not imported)
    pool   = open(os.path.join(path, 'pool')).read()
    status = zpool_status(pool)
    if status['state'] != 'ONLINE':
        raise RuntimeError("pool at '%s' must be online"%path)
    # Determine the size of the device in the pool:
    images = zpool_image_files(pool)
    if len(images) != 1:
        raise RuntimeError("there must be exactly one image file")
    cur_image = images[0]
    size_byte = os.stat(cur_image).st_size

    # Ensure there is sufficient space to defrag:
    if size_byte > int(cmd("df --block-size=1 '%s'"%path, verbose=verbose).splitlines()[1].split()[3]):
        raise RuntimeError("there might not be sufficient free disk space to defrag '%s'"%path)

    # Create new sparse image file:
    i = 0
    while True:
        new_image = os.path.join(path, '0%s.img'%i)
        if not os.path.exists(new_image):
            break
        i += 1

    cmd("truncate -s %s %s"%(size_byte, new_image), verbose=verbose)

    # Replace existing image by new one:
    cmd("zpool replace {pool} {cur_image} {new_image}".format(
            pool=pool, cur_image=cur_image, new_image=new_image), verbose=verbose)

    # Wait until resilvering is complete:
    while True:
        status = zpool_status(pool)
        if status.get('action', '').lower().startswith("wait for the resilver"):
            if verbose: print(status.get('scan',''))
            time.sleep(7)
        else:
            break

    # Delete unused image files:
    zpool_delete_unused_images(path, verbose=verbose)

def zpool_delete_unused_images(path, verbose=False):
    pool   = open(os.path.join(path, 'pool')).read()
    images = set(zpool_image_files(pool))
    for x in os.listdir(path):
        if x.endswith('.img'):
            full_path = os.path.join(path, x)
            if full_path not in images:
                if verbose: print("removing '%s'"%full_path)
                os.unlink(full_path)

def zpool_defragment(args):
    defragment_zfs_pool(args.path, verbose=not args.quiet)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='SMC Storage k8s vendor driver')
    subparsers = parser.add_subparsers(help='sub-command help')

    sub = subparsers.add_parser('init', help='initialize the storage driver')
    sub.set_defaults(func=init)

    sub = subparsers.add_parser('attach', help='attach to NFS server and create or import the remote ZFS pool')
    sub.add_argument('json_params', type=str, help="""json of object '{"project_id": "f8cf98ed-299e-4423-a167-870e8658e081"}""")
    sub.set_defaults(func=attach)

    sub = subparsers.add_parser('mount', help='mount the ZFS pool, which is assumed to exist, at a given mountpoint; also create bind mounts for snapshots')
    sub.add_argument('mount_dir', type=str, help='mount dir')
    sub.add_argument('device', type=str, help='device name')
    sub.add_argument('json_params', type=str, help='json params {...}')
    sub.set_defaults(func=mount)

    sub = subparsers.add_parser('unmount', help='')
    sub.add_argument('mount_dir', type=str, help='mount dir')
    sub.set_defaults(func=unmount)

    sub = subparsers.add_parser('detach', help='export ZFS pool and remove snapshot bind mount')
    sub.add_argument('device', type=str, help='mount device')
    sub.set_defaults(func=detach)

    sub = subparsers.add_parser('update-all-locks', help='update all lock files')
    sub.set_defaults(func=update_all_locks)

    sub = subparsers.add_parser('zpool-update-snapshots', help='update all zpool snapshots; outputs to stdout json data about what happened')
    sub.set_defaults(func=zpool_update_snapshots)

    sub = subparsers.add_parser('zpool-clear-errors', help='run zpool status and clear any errors')
    sub.set_defaults(func=zpool_clear_errors)

    sub = subparsers.add_parser('zpool-defragment', help='defragment **mounted** ZFS pool (WARNING: slow since all data over network)')
    sub.add_argument('-q', '--quiet', action="store_true")
    sub.add_argument('path', type=str, help='absolute path to images')
    sub.set_defaults(func=zpool_defragment)

    sub = subparsers.add_parser('zpool-resize', help='resize an zpool')
    sub.add_argument('path', type=str, help='absolute path to images')
    sub.add_argument('size', type=str, help='new size')
    sub.add_argument('-q', '--quiet', action="store_true")
    sub.set_defaults(func=zpool_resize)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        try:
            x = args.func(args)
            obj = {"status": "Success"}
            if x:
                obj.update(x)
            log(obj)
            sys.exit(0)
        except Exception as msg:
            log({'status':'Failure', 'message':repr(msg)})
            sys.exit(1)
            #raise