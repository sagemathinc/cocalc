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



### DEPRECATED ##

# This script is run by /etc/rc.local when booting up gce machines.  It does special configuration
# depending on what devices are available, etc.

import os, socket

hostname = socket.gethostname()

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

    # hostname
    if os.path.exists('/mnt/conf/hostname'):
        cmd("cp /mnt/conf/hostname /etc/hostname")
        cmd("hostname `cat /mnt/conf/hostname`")

    # tinc
    if os.path.exists('/mnt/conf/tinc'):
        cmd("mkdir -p /home/salvus/salvus/salvus/data/local/etc/tinc")
        cmd("mount -o bind /mnt/conf/tinc /home/salvus/salvus/salvus/data/local/etc/tinc")
        cmd("cp /mnt/conf/tinc/hosts.0/* /mnt/conf/tinc/hosts/")
        cmd("mkdir -p /home/salvus/salvus/salvus/data/local/var/run/")
        cmd("/home/salvus/salvus/salvus/data/local/sbin/tincd -k; sleep 2")
        cmd("nice --19 /home/salvus/salvus/salvus/data/local/sbin/tincd")

    # Copy over newest version of certain scripts and set permissions
    for s in ['bup_storage.py', 'hashring.py']:
        os.system("cp /home/salvus/salvus/salvus/scripts/%s /usr/local/bin/; chmod og-w /usr/local/bin/%s; chmod og+rx /usr/local/bin/%s"%(s,s,s))

    # make it so there is a stable mac address for people who want to run their legal copy of magma, etc. in a private project.
    cmd("ip link add link eth0 address f0:de:f1:b0:66:8e eth0.1 type macvlan")
    cmd("ip link add link eth0 address 5e:d4:a9:c7:c8:f4 eth0.2 type macvlan")

    # run post-configuration script
    if os.path.exists("/mnt/conf/post"):
        cmd("/mnt/conf/post")

    cmd("chmod og-rwx -R /home/salvus/")

    if hostname.startswith('devel'):
        os.system('rm -rf /home/salvus/salvus/salvus/data/secrets/cassandra')

    if hostname.startswith('compute'):
        # Create a firewall so that only the hub nodes can connect to things like ipython and the raw server.
        cmd("/home/salvus/salvus/salvus/scripts/compute_firewall.sh")
        # Delete data that doesn't need to be on this node
        cmd("rm -rf /home/salvus/salvus/salvus/data/secrets/cassandra")
        # Start the storage server
        os.system("umount /projects; umount /bup/conf; umount /bup/bups; zpool import -f bup; zfs set mountpoint=/projects bup/projects; chmod og-r /projects; su - salvus -c 'cd /home/salvus/salvus/salvus/&& . smc-env&& ./bup_server start'")
        # Install crontab for snapshotting the bup pool, etc.
        os.system("crontab /home/salvus/salvus/salvus/scripts/root-compute.crontab")

    if hostname.startswith("cassandra"):
        # Delete data that doesn't need to be on this node
        cmd("rm -rf /home/salvus/salvus/salvus/data/secrets/")
        # Copy custom config, start cassandra Daemon
        cmd("mkdir /cassandra; mount /dev/sdb2 /cassandra")
        cmd("rm -rf /var/log/cassandra; ln -s /cassandra/log /var/log/cassandra; cp /cassandra/etc/* /etc/cassandra/;  rm -rf /var/lib/cassandra; ln -s /cassandra/lib /var/lib/cassandra; service cassandra start")
        cmd("rm -rf /home/salvus/salvus/salvus/data/secrets")


if __name__ == "__main__":
    if mount_conf():
        conf()
