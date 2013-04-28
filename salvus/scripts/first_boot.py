#!/usr/bin/env python

# This script is run by /etc/rc.local when booting up.  It does special configuration
# depending on what images are mounted, etc. 

import os

if os.path.exists('/mnt/home/'):
    # Compute machine

    # Restore user accounts
    if os.path.exists('/mnt/home/etc/'):
        os.system("cp /mnt/home/etc/* /etc/")
    else:
        os.system("mkdir -p /mnt/home/etc/")

    # Setup /tmp so it is on the external disk image (and has that quota)
    os.system("mkdir -p /mnt/home/tmp/; mount -o bind /mnt/home/tmp /tmp; chmod a+rw /tmp/")


