#!/usr/bin/env python

# This script is run by /etc/rc.local when booting up.  It does special configuration
# depending on what images are mounted, etc.

import os, socket

# If hostname isn't "salvus-base", then setup /tmp and swap.

if socket.gethostname() != "salvus-base":
    # Enable swap
    if not os.path.exists("/mnt/home/"):
        os.system("swapon /dev/salvus-base/swap")
    # Mount tmp
    os.system("mount /dev/salvus-base/tmp /tmp; chmod +t /tmp; chmod a+rwx /tmp/")

if os.path.exists('/projects') or os.path.exists('/mnt/home/'):

    # Delete secrets that aren't needed for the *compute machines* (only web machines)
    os.system('rm -rf /home/salvus/salvus/salvus/data/secrets')

    # Copy latest version of storage.py script from salvus repo
    os.system('cp /home/salvus/salvus/salvus/scripts/storage.py /home/storage/bin/; chown storage. /home/storage/bin/storage.py')

    # Delete ssh private key not needed for the *compute machines*; not deleting this
    # is a major security risk, since this key could provide access to a database node
    # (say) to a user on the compute node who cracks the salvus account.
    os.system('rm -rf /home/salvus/.ssh/id_rsa')

    # Restore existing user accounts
    if os.path.exists('/mnt/home/etc/'):
        os.system("cp -rv /mnt/home/etc/* /etc/")
    else:
        os.system("mkdir -p /mnt/home/etc/")

    # Store crontabs in persistent storage, so they don't vanish on VM restart
    if not os.path.exists("/mnt/home/crontabs/"):
        os.system("mkdir -p /mnt/home/crontabs/; chgrp crontab /mnt/home/crontabs; chmod 1730 /mnt/home/crontabs")
    os.system("cd /var/spool/cron/; rm -rf crontabs; ln -s /mnt/home/crontabs .")

    # Setup /tmp so it is on the external disk image (has that quota) and is clean, since this is a fresh boot.
    # os.system("rm -rf /mnt/home/tmp; mkdir -p /mnt/home/tmp/; chmod +t /mnt/home/tmp; mount -o bind /mnt/home/tmp /tmp; chmod a+rwx /mnt/home/tmp/")

    # Scratch is persistent but not backed up.
    os.system("mkdir -p /mnt/home/scratch; mkdir -p /scratch; chmod +t /mnt/home/tmp; mount -o bind /mnt/home/scratch /scratch;  chmod a+rwx /mnt/home/scratch/")

    # Import the ZFS pool
    #os.system("zpool import -Nf projects; mkdir -p /projects; chmod a+rx /projects")

else:

    # not a compute node, so no need for the storage account, which provides some ssh equivalence
    os.system('rm -rf /home/storage/')

