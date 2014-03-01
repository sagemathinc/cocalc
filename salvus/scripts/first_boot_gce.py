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
    if e:
        print t
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
        # critical to protect visibility, since contains vpn keys.
        cmd("mkdir -p /mnt/conf; mount /dev/sdb1 /mnt/conf; chmod og-rwx /mnt/conf; chown root. /mnt/conf")
        return True
    else:
        return False

def conf():
    # assuming /mnt/conf got mounted, do the configuration.

    if os.path.exists("/mnt/conf/pre"):
        cmd("/mnt/conf/pre")

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
        open('/etc/fstab','w').write(fstab0 + '\n#SALVUS -- everything below this is automatically added from /mnt/conf/fstab! \n' + fstab1)
        cmd("mount -a")

    # tinc
    if os.path.exists('/mnt/conf/tinc'):
        cmd("mkdir -p /home/salvus/salvus/salvus/data/local/etc/tinc")
        cmd("mount -o bind /mnt/conf/tinc /home/salvus/salvus/salvus/data/local/etc/tinc")
        cmd("cp /mnt/conf/tinc/hosts.0/* /mnt/conf/tinc/hosts/")
        cmd("mkdir -p /home/salvus/salvus/salvus/data/local/var/run/")
        cmd("/home/salvus/salvus/salvus/data/local/sbin/tincd -k; sleep 2")
        cmd("nice --19 /home/salvus/salvus/salvus/data/local/sbin/tincd")

    # restore project user accounts
    if os.path.exists('/mnt/conf/etc/'):
        os.system("cp -rv /mnt/conf/etc/* /etc/")
    else:
        os.system("mkdir -p /mnt/conf/etc/")

    # Copy over newest version of sudo project creation script, and ensure permissions are right.
    os.system("cp /home/salvus/salvus/salvus/scripts/create_project_user.py /usr/local/bin/; chmod a-w /usr/local/bin/create_project_user.py; chmod a+rx /usr/local/bin/create_project_user.py")

    # make it so there is a stable mac address for people who want to run their legal copy of magma, etc. in a private project.
    cmd("ip link add link eth0 address f0:de:f1:b0:66:8e eth0.1 type macvlan")
    cmd("ip link add link eth0 address 5e:d4:a9:c7:c8:f4 eth0.2 type macvlan")

    # run post-configuration script
    if os.path.exists("/mnt/conf/post"):
        cmd("/mnt/conf/post")

    # Create the storage user in case it doesn't exist
    cmd("groupadd -g 999 -o storage")
    cmd("useradd -u 999 -g 999 -o -d /home/storage storage")

    cmd("chmod og-rwx -R /home/salvus/")
    cmd("chmod og-rwx -R /home/storage/")

    # Copy over newest version of storage management script to storage user. 
    os.system("cp /home/salvus/salvus/salvus/scripts/smc_storage.py /home/storage/; chown storage. /home/storage/smc_storage.py")

    # Remove the temporary ZFS send/recv streams -- they can't possibly be valid since we're just booting up.
    cmd("rm /home/storage/.storage*")

    # Import the ZFS pool -- without mounting!
    cmd("/home/salvus/salvus/salvus/scripts/mount_zfs_pools.py & ")

if __name__ == "__main__":
    if mount_conf():
        conf()
