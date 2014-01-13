#!/usr/bin/env python

# This script is run by /etc/rc.local when booting up.  It does special configuration
# depending on what images are mounted, etc.

import os, socket, sys

# If hostname isn't "salvus-base", then setup /tmp and swap.

if socket.gethostname() == "salvus-base":
    sys.exit(0)

# Enable swap
if not os.path.exists("/mnt/home/"):
    os.system("swapon /dev/salvus-base/swap")

# Mount tmp
os.system("mount /dev/salvus-base/tmp /tmp; chmod +t /tmp; chmod a+rwx /tmp/")

if os.path.exists('/mnt/home/'):

    # Delete secrets that aren't needed for the *compute machines* (only web machines)
    os.system('rm -rf /home/salvus/salvus/salvus/data/secrets')

    # Delete ssh private key not needed for the *compute machines*; not deleting this
    # would be a security risk, since this key could provide access to a database node
    # (say) to a user on the compute node who cracks the salvus account. As it is, there
    # is nothing stored on a compute node that directly gives access to any other
    # nodes.  The one dangerous thing is the tinc vpn private key, which gets the
    # machine on the VPN.  However, even that is destroyed when the machine is restarted
    # (at least at UW) and I think being on the vpn doesn't immediately provide a way
    # to break in; it's just a step.
    os.system('rm -rf /home/salvus/.ssh/id_rsa')

    # Restore existing user accounts
    if os.path.exists('/mnt/home/etc/'):
        os.system("cp -rv /mnt/home/etc/* /etc/")
    else:
        os.system("mkdir -p /mnt/home/etc/")

    # Store crontabs in persistent storage, so they don't vanish on VM restart
    if not os.path.exists("/mnt/home/crontabs/"):
        os.system("mkdir -p /mnt/home/crontabs/; chmod a+rx /mnt/home/; chgrp crontab /mnt/home/crontabs; chmod 1730 /mnt/home/crontabs")
    os.system("cd /var/spool/cron/; rm -rf crontabs; ln -s /mnt/home/crontabs .")

    # Setup /tmp so it is on the external disk image (has that quota) and is clean, since this is a fresh boot.
    # os.system("rm -rf /mnt/home/tmp; mkdir -p /mnt/home/tmp/; chmod +t /mnt/home/tmp; mount -o bind /mnt/home/tmp /tmp; chmod a+rwx /mnt/home/tmp/")

    # Scratch is persistent but not backed up.
    os.system("mkdir -p /mnt/home/scratch; mkdir -p /scratch; chmod +t /mnt/home/tmp; mount -o bind /mnt/home/scratch /scratch;  chmod a+rwx /mnt/home/scratch/")


    # Copy over newest version of sudo project creation script, and ensure permissions are right.
    os.system("cp /home/salvus/salvus/salvus/scripts/create_project_user.py /usr/local/bin/; chmod og-w /usr/local/bin/create_project_user.py; chmod og+rx /usr/local/bin/create_project_user.py")

    # Re-create the storage user
    os.system("groupadd -g 999 -o storage")
    os.system("useradd -u 999 -g 999 -o -d /home/storage storage")
    os.system("chown -R storage. /home/storage")
    os.system("chmod og-rwx -R /home/storage/&")

    # Remove the temporary ZFS send/recv streams -- they can't possibly be valid since we're just booting up.
    os.system("rm /home/storage/.storage*")

    # Import the ZFS pool -- without mounting!
    os.system("/home/salvus/salvus/salvus/scripts/mount_zfs_pools.py & ")

else:

    # not a compute node, so no need for the storage account, which provides some ssh stuff we might not need...
    os.system('rm -rf /home/storage/')

# Lock down some perms a little, just in case I were to mess up somehow at some point
os.system("chmod og-rwx -R /home/salvus/&")


