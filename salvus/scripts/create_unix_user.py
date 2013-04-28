#!/usr/bin/env python

"""
Create a unix user, setup ssh keys, impose quota, etc.

You should put the following in visudo:

   salvus ALL=(ALL)   NOPASSWD:  /home/salvus/salvus/salvus/scripts/create_unix_user.py ""

ALSO **IMPORTANT** put a locally built copy of .sagemathcloud (with secret deleted) in
scripts/skel to massively speed up new project creation.

"""

BASE_DIR='/mnt/home/'

from subprocess import Popen, PIPE
import os, random, string, sys, uuid
# os.system('whoami')

skel = os.path.join(os.path.split(os.path.realpath(__file__))[0], 'skel')
#print skel

def cmd(args):
    if isinstance(args, str):
        shell = True
        #print args
    else:
        shell = False
        #print ' '.join(args)
    out = Popen(args, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=shell)
    e = out.wait()
    stdout = out.stdout.read()
    stderr = out.stderr.read()
    if e:
        sys.stdout.write(stdout)
        sys.stderr.write(stderr)
        sys.exit(e)
    return {'stdout':stdout, 'stderr':stderr}

# Using a random username helps to massively reduce the chances of race conditions...
# Also, it means this sudo script doesn't have to take arguments (which are a security risk).
alpha    =  string.ascii_lowercase + string.digits
username =  ''.join([random.choice(alpha) for _ in range(8)])

out = cmd(['useradd', '-b', BASE_DIR, '-m', '-U', '-k', skel, username])

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

# Save account info so it persists through reboots/upgrades/etc.
if os.path.exists("/mnt/home/etc/"):
    cmd("cp /etc/passwd /etc/shadow /etc/group /mnt/home/etc/")
