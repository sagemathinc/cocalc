#!/usr/bin/env python

# This script is run by /etc/rc.local when booting up gce machines.  It does special configuration
# depending on what devices are available, etc.

import os, socket

def cmd(s):
    print s
    from subprocess import Popen, PIPE
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=True)
    e = out.wait()
    t = out.stdout.read() + out.stderr.read()
    if e: raise RuntimeError(t)
    return t

def get_disks():
    ans = {}
    for x in cmd("/bin/ls -l /dev/disk/by-uuid/").splitlines():
        v = x.split()
        if len(v) > 3:
            device = os.path.join('/dev', os.path.split(v[-1])[-1])
            uuid = v[-3]
            ans[device] = uuid
    return ans

def mount_conf():
    # mount the /mnt/conf partition if available and return True if so.
    # return False if not available
    d = get_disks()
    if '/dev/sdb1' in d:
        # have a conf partition 
        cmd("mkdir -p /mnt/conf; mount /dev/sdb1 /mnt/conf")
        return True
    else:
        return False

def conf():
    # assuming /mnt/conf got mounted, do the configuration.

    # stop services whose conf might change
    if os.path.exists("/mnt/conf/pre"):
        cmd("/mnt/conf/pre")

    cmd("service glusterfs-server  stop")
    if os.path.exists("/mnt/conf/fstab"):
        # mkdir each mount point
        for x in open("/mnt/conf/fstab").readlines():
            x = x.strip()
            if not x.startswith('#'):
                v = x.split()
                if len(v) >= 2:
                   cmd('mkdir -p "%s"'%v[1])
 
    # append /mnt/conf/fstab to the end of fstab and do "mount -a"
    if os.path.exists('/mnt/conf/fstab'):
        fstab0 = open('/etc/fstab').read()
        fstab1 = open('/mnt/conf/fstab').read()
        i = fstab0.find("#SALVUS")
        if i != -1:
            fstab0 = fstab0[:i]
        open('/etc/fstab','w').write(fstab0 + '\n#SALVUS\n' + fstab1)
        cmd("mount -a")

    # start services back up
    cmd("service glusterfs-server  start")

    # run post-configuration script    
    if os.path.exists("/mnt/conf/post"):
        cmd("/mnt/conf/post")


