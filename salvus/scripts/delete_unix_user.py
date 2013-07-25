#!/usr/bin/env python

"""
Complete delete a given unix user

You should put the following in visudo:

   salvus ALL=(ALL)   NOPASSWD:  /home/salvus/salvus/salvus/scripts/delete_unix_user.py ""

"""

BASE_DIR='/mnt/home'

from subprocess import Popen, PIPE
import os

def deluser(username):
    # We use the deluser unix command.
    # deluser [options] [--force] [--remove-home] [--remove-all-files]

    args = ['deluser', '--force', '--remove-home', username]
    out = Popen(args, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=shell)
    e = out.wait()
    stdout = out.stdout.read()
    stderr = out.stderr.read()
    if e:
        sys.stdout.write(stdout)
        sys.stderr.write(stderr)
        sys.exit(e)
    else:
        sys.exit(0)

if len(sys.argv) == 0:
    print "Usage: %s <username>"%sys.argv[0]
else:
    deluser(sys.argv[1])


