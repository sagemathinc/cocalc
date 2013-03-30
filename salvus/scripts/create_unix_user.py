#!/usr/bin/env python

"""
Create a unix user, setup ssh keys, impose quota, etc.
"""

import os, sys

from subprocess import Popen, PIPE

def cmd(args):
    if isinstance(args, str):
        shell = True
    else:
        shell = False
    out = Popen(args, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=shell)
    e = out.wait()
    stdout = out.stdout.read()
    stderr = out.stderr.read()
    if e:
        sys.stdout.write(stdout)
        sys.stderr.write(stderr)
        sys.exit(e)
    return {'stdout':stdout, 'stderr':stderr}

if len(sys.argv) == 1:
    n = 0
    username = 'sage%s'%n
    while os.path.exists('/home/%s'%username):
        n += 1
        username = 'sage%s'%n
else:
    username = sys.argv[1]

out = cmd(['useradd', '-m', '-U', '-k', 'skel', username])

# coffeescript to determine 
# BLOCK_SIZE = 4096   # units = bytes; This is used by the quota command via the conversion below.
# megabytes_to_blocks = (mb) -> Math.floor(mb*1000000/BLOCK_SIZE) + 1
# ensure host system is setup with quota for this to do anything: http://www.ubuntugeek.com/how-to-setup-disk-quotas-in-ubuntu.html

disk_soft_mb = 100 # 100 megabytes
disk_soft = disk_soft_mb * 245
disk_hard = 2*disk_soft
inode_soft = 5000
inode_hard = 2*inode_soft
cmd(["setquota", '-u', username, str(disk_soft), str(disk_hard), str(inode_soft), str(inode_hard), '-a'])

print username
