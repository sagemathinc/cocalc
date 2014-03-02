#!/usr/bin/env python

import os

# Pool for the new storage system
os.system("zpool import -f storage")

# Old projects pool
os.system("zpool import -Nf projects; mkdir -p /projects; chmod a+rx /projects; chmod a+rwx /scratch") 
