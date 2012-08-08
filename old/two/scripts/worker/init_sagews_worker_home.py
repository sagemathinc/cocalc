#!/usr/bin/env python

"""
Completely resets/initializes all home directories of of sagews_workers:

  1. Delete everything from /home/sagews_worker*

  2. Create a .ssh directory with authorized_keys file (having correct
     permissions) for all users with name sagews_worker*.  The
     authorized_keys file is equal to the sagews id_rsa.pub file.
     This way the sagews user can do any management of the workers
     later.

  3. Makes sure ownership and permissions on home directory of all
     sagews_worker accounts is locked down.

  4. Sets quotas, based on available free space, so all users could
     max them out and we would still have 10000 blocks and 1000 inodes
     free.

This script must be run using sudo.
"""

import os, shutil, sys

me = os.environ['HOME']
home = os.path.split(me)[0]

authorized_keys = open(os.path.join(os.environ['HOME'], '.ssh', 'id_rsa.pub')).read()

def shell(cmd):
    # I'm using shell commands instead of Python often, since speed is not paramount
    print cmd
    if os.system(cmd):
        print "Error"
        sys.exit(1)

# Make sure the sagews manager user is "safe", though we will store little of consequence here.
shell('chmod -R og-rwx "%s"'%me)

# Determine workers:

sagews_workers = [user for user in os.listdir(home) if user.startswith('sagews_worker')]
num_workers = len(sagews_workers)

# Determine quotas
free_blocks = int(os.popen('df /').readlines()[1].split()[3])
block_quota = (free_blocks-10000) / num_workers

free_inodes = int(os.popen('df -i /').readlines()[1].split()[3])
inode_quota = (free_inodes-1000) / num_workers

for user in sagews_workers:
        print user
        path = os.path.join(home, user)

        # ssh
        ssh = os.path.join(path, '.ssh')
        shutil.rmtree(path)
        if not os.path.exists(ssh):
            os.makedirs(ssh)
        open(os.path.join(ssh, 'authorized_keys'),'w').write(authorized_keys)

        # permissions
        shell('chown -R %s. "%s"'%(user, path))
        shell('chmod -R og-rwx "%s"'%path)

        # quotas
        shell("setquota %s 0 %s 0 %s -a"%(user, block_quota, inode_quota))

    

