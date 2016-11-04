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



# This script is run by /etc/rc.local when booting up.  It does special configuration
# depending on what images are mounted, etc.

import os, socket, sys

hostname = socket.gethostname()

if hostname.startswith("salvus-base"):
    # no special config -- this is our template machine
    sys.exit(0)

if hostname.startswith('devel'):
    os.system('/root/ip_blacklist/block.sh')

    # do NOT want this node on tinc network -- that messes up bup server, making it listen only externally, etc.
    os.system("killall tincd")
    # And make sure tinc can't be started, which would happen later, and is a potential security hole -- this deletes the trusted private key.
    os.system("rm -rf /home/salvus/salvus/salvus/data/local/etc/tinc/")

    # mount pool and start bup
    os.system("zpool import -f pool; zfs mount -a; chmod og-r /projects; su - salvus -c 'cd /home/salvus/salvus/salvus/&& . smc-env&& export BUP_POOL=\"pool\"; ./bup_server start'")
    # replace this secret by something harmless (don't just delete since hub.coffee assumes file exists)
    os.system('echo ""> /home/salvus/salvus/salvus/data/secrets/cassandra/hub')

    # devel machines don't need this password...
    os.system('echo ""> /home/salvus/salvus/salvus/data/secrets/sendgrid_email_password')

    # setup a fake pem
    os.system("cp /home/salvus/salvus/salvus/data/secrets/sagemath.com/nopassphrase.pem.fake /home/salvus/salvus/salvus/data/secrets/sagemath.com/nopassphrase.pem")

    # Copy over newest version of certain scripts and set permissions
    for s in ['bup_storage.py']:
        os.system("cp /home/salvus/salvus/salvus/scripts/%s /usr/local/bin/; chmod og-w /usr/local/bin/%s; chmod og+rx /usr/local/bin/%s"%(s,s,s))

if hostname.startswith('compute'):
    # Delete secrets that aren't needed for the *compute machines* (only web machines)
    os.system('rm -rf /home/salvus/salvus/salvus/data/secrets/')

    if False:
        # Store crontabs in persistent storage, so they don't vanish on VM restart
        # disabled -- need to do something that takes into account how projects can move.
        if not os.path.exists("/mnt/home/crontabs/"):
           os.system("mkdir -p /mnt/home/crontabs/; chmod a+rx /mnt/home/; chgrp crontab /mnt/home/crontabs; chmod 1730 /mnt/home/crontabs")
        os.system("cd /var/spool/cron/; rm -rf crontabs; ln -s /mnt/home/crontabs .")

    # Copy over newest version of certain scripts and set permissions
    for s in ['bup_storage.py']:
        os.system("cp /home/salvus/salvus/salvus/scripts/%s /usr/local/bin/; chmod og-w /usr/local/bin/%s; chmod og+rx /usr/local/bin/%s"%(s,s,s))


    # Start the bup storage server:
    os.system("umount /projects; umount /bup/conf; umount /bup/bups; zpool import -f bup; zfs set mountpoint=/projects bup/projects; chmod og-r /projects")
    # It's critical to start tinc *after* the above ZFS pools are mounted (so we don't get rsync'd), but before we start bup_server (which needs to know the tun0 address)
    os.system("nice --19 /home/salvus/salvus/salvus/data/local/sbin/tincd")

    os.system("su - salvus -c 'cd /home/salvus/salvus/salvus/&& . smc-env&& ./bup_server start'")
    # Install crontab for snapshotting the bup pool, etc.
    os.system("crontab /home/salvus/salvus/salvus/scripts/root-compute.crontab")

    # Start our low-level iptables mostly-outgoing-blocking firewall
    os.system('cd /root/smc-iptables; ./restart.sh')
        
# Lock down some perms a little, just in case I were to mess up somehow at some point
os.system("chmod og-rwx -R /home/salvus/&")


if hostname.startswith('cassandra'):
    # Delete data that doesn't need to be on this node
    os.system("rm -rf /home/salvus/salvus/salvus/data/secrets/")
    # import and mount the relevant ZFS pool -- do this blocking, since once the machine is up we had better
    # be able to start cassandra itself.
    os.system("zpool import -f cassandra ")

    # set clearly permissions constraints: see -- http://www.datastax.com/docs/1.1/install/recommended_settings
    open("/etc/security/limits.conf","w").write("""
        * soft memlock unlimited
        * hard memlock unlimited
        * soft nofile 32768
        * hard nofile 32768
        * soft as unlimited
        * hard as unlimited
    """)

    os.system("sysctl -w vm.max_map_count=131072")

    # Ensure no swap: http://www.datastax.com/docs/1.1/install/recommended_settings
    os.system("swapoff --all")

if hostname.startswith('compute'):
    # Create a firewall so that only the hub nodes can connect to things like ipython and the raw server.
    os.system("/home/salvus/salvus/salvus/scripts/compute_firewall.sh")






