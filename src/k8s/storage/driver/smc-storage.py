#!/usr/bin/env python2

# Installation is as follows.  However, this is all automated by the storage-daemon daemonset!  You don't
# do this manually.    Install as (yes, without the .py extension!)
#
#    /usr/libexec/kubernetes/kubelet-plugins/volume/exec/smc~smc-storage/smc-storage
#
# The minion node must also have ZFS installed (so, e.g,. `zpool list` works) and `bindfs` (for snapshots).
#

import json, os, shutil, socket, sys, time, uuid

LOCK_TIME_S = 120

HOSTNAME = socket.gethostname()

def LOG(*args):
    open("/tmp/a",'a').write(str(args)+'\n')

LOG('argsv', sys.argv)

def log(obj):
    LOG("Will return '%s'"%obj)
    print(json.dumps(obj, separators=(',', ':')))

def cmd(s):
    LOG("cmd('%s')"%s)
    z = os.popen(s+" 2>&1 ")
    t = z.read()
    if z.close():
        raise RuntimeError(t)
    return t

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
    return os.path.join(path, 'lock')

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

    size = params.get("size", '1G')
    if not size:
        raise RuntimeError("size can't be 0")

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

def attach_zfs(path, size):
    images = [x for x in os.listdir(path) if x.endswith('.img')]
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
        mount_point = ensure_server_is_mounted(server, namespace)
        path = os.path.join(mount_point, path)
        return mount_zfs(path, mount_dir)
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

def mount_zfs(path, mount_dir):
    pool_file = os.path.join(path, 'pool')
    pool = open(pool_file).read().strip()
    try:
        cmd("zpool import %s -d %s"%(pool, path))
    except Exception as err:
        if 'give it a new name' not in str(err):
            raise
    cmd("zfs set mountpoint='%s' %s"%(mount_dir, pool))
    # Also bindfs (FUSE!) mount the snapshots, since otherwise new ones won't work in the container!
    snapshots = os.path.join(mount_dir, '.snapshots')
    if not os.path.exists(snapshots):
        os.makedirs(snapshots)
    cmd("bindfs %s %s"%(os.path.join(mount_dir, '.zfs', 'snapshot'), snapshots))

def unmount(args):
    LOG('unmount', args)
    mount_dir  = args.mount_dir
    if os.path.exists(mount_dir):
        snapshots = os.path.join(mount_dir, '.snapshots')
        if os.path.exists(snapshots) and os.path.ismount(snapshots):
            cmd("umount %s"%snapshots)
        else:
            # not a ZFS mount
            cmd("umount %s"%mount_dir)
            return
        v = cmd("zfs list -H | grep %s"%mount_dir).split()
        if len(v) > 0:
            cmd("zfs set mountpoint=none %s"%v[0])

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
    cmd("zpool export {device}".format(device=device))
    remove_lock_file(path)

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