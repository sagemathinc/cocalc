#!/usr/bin/env python2

# Install as (yes, without the .py extension!)
#
#    /usr/libexec/kubernetes/kubelet-plugins/volume/exec/smc~smc-storage/smc-storage
#
# The minion node must also have ZFS installed (so, e.g,. `zpool list` works) and `bindfs`.
#

import json, os, shutil, sys, uuid

def LOG(*args):
    open("/tmp/a",'a').write(str(args)+'\n')

LOG('argsv', sys.argv)

def log(obj):
    LOG("Will return '%s'"%obj)
    print(json.dumps(obj))

def cmd(s):
    LOG("cmd('%s')"%s)
    z = os.popen(s+" 2>&1 ")
    t = z.read()
    if z.close():
        raise RuntimeError(t)
    return t

def init(args):
    LOG('init', args)
    # TODO: would ensure zfs kernel module is available (?)
    return

def ensure_server_is_mounted(server):
    # server is a string like '10.245.201.4:/projects'
    mnt = os.path.join("/mnt/smc-storage", server)
    if not os.path.exists(mnt):
        os.makedirs(mnt)
    if not os.path.ismount(mnt):
        # We are using NFS; however, we might switch to use sshfs or something else
        # if we ever have trouble.  This is the only thing that would have to change:
        cmd("mount -t nfs %s %s"%(server, mnt))
    return mnt

# Attach device to minion
def attach(args):
    LOG('attach', args)
    params = json.loads(args.json_params)

    path = params.get("path", None)
    if not path:
        raise RuntimeError("must specify path of the form path/to/foo.nfs, path/to/foo.ext4 path/to/foo.zfs")

    server = params.get("server", None)
    if not server:
        raise RuntimeError("must specify server 'ip_address:/path'")

    size = params.get("size", '1G')
    if not size:
        raise RuntimeError("size can't be 0")

    mount_point = ensure_server_is_mounted(server)

    ext = os.path.splitext(path)[1][1:]
    path = os.path.join(mount_point, path)
    if ext in ['ext4', 'zfs', 'btrfs']:
        if not os.path.exists(path):
            containing_dir = os.path.split(path)[0]
            if not os.path.exists(containing_dir):
                os.makedirs(containing_dir)
            cmd('truncate -s %s %s'%(size, path))
            format = True
        else:
            format = False

        try:
            device = cmd("losetup -v -f %s"%path).split()[-1]
        except Exception as err:
            if "could not find any free loop device" in str(err):
                # make a loop device
                n = 8
                while os.path.exists('/dev/loop%s'%n):
                    n += 1
                cmd("mknod -m 660 /dev/loop%s b 7 %s"%(n,n))
                device = cmd("losetup -v -f %s"%path).split()[-1]

        if format:
            if ext == 'zfs':
                pool = 'pool-' + str(uuid.uuid4())
                cmd("zpool create %s -f %s"%(pool, path))
                cmd("zfs set compression=lz4 %s"%pool)
                cmd("zfs set dedup=on %s"%pool)
            elif ext in ['ext4', 'btrfs']:
                cmd('mkfs.%s -q %s'%(ext, device))
            else:
                raise RuntimeError("unsupported filesystem type '%s'"%fs_type)
    elif ext == 'nfs':
        if not os.path.exists(path):
            os.makedirs(path)
        device = path
    else:
        raise RuntimeError("unsupported type '%s'"%ext)

    return {'device':device}

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
        raise RuntimeError("must specify path of the form path/to/foo.nfs, path/to/foo.ext4 path/to/foo.zfs")

    ext = os.path.splitext(path)[1][1:]
    if device.endswith('.nfs'):
        cmd("mount --bind %s %s"%(device, mount_dir))
    elif ext == 'zfs':
        server = params.get("server", None)
        if not server:
            raise RuntimeError("must specify server 'ip_address:/path'")
        p = os.path.join(ensure_server_is_mounted(server), path)
        try:
            pool = get_pool(p)
        except:
            cmd("zpool import -d /dev  -a")
            pool = get_pool(p)
        cmd("zfs set mountpoint='%s' %s"%(mount_dir, pool))
        # Also bindfs (fuse module) mount the snapshots, since otherwise new ones won't work in the container!
        snapshots = os.path.join(mount_dir, '.snapshots')
        if not os.path.exists(snapshots):
            os.makedirs(snapshots)
        cmd("bindfs %s %s"%(os.path.join(mount_dir, '.zfs', 'snapshot'), snapshots))
    else:
        cmd("mount %s %s"%(device, mount_dir))

def unmount(args):
    LOG('unmount', args)
    mount_dir  = args.mount_dir
    if os.path.exists(mount_dir):
        try:
            snapshots = os.path.join(mount_dir, '.snapshots')
            cmd("umount %s"%snapshots)
            pool = cmd("zfs list -H | grep %s"%mount_dir).split()[0]
            cmd("zfs set mountpoint=none %s"%pool)
        except:
            # turns out it is not a ZFS mount
            cmd("umount %s"%mount_dir)


def detach(args):
    LOG('detach', args)
    device = args.device
    if device.endswith('.nfs'):
        # nothing to detach
        return
    if '/dev/loop' not in device:
        # ZFS, so determine file  (device= pool name)
        pool = device
        image = None
        for k in cmd("zpool status %s"%pool).splitlines():
            v = k.split()
            if len(v) > 0 and v[0].endswith('.zfs'):
                image = v[0]
                break
        if image is None:
            raise RuntimeError("unable to determine image")
        # this is the device to unmount
        device = cmd("losetup -j %s"%image).split(':')[0]
        # But first export the pool
        cmd("zpool export %s"%pool)

    # In all cases now we free up the loopback device.
    cmd("losetup -d %s"%device)

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