#!/usr/bin/env python

"""
Complete delete a given unix user

You should put the following in visudo:

   salvus ALL=(ALL)   NOPASSWD:  /home/salvus/salvus/salvus/scripts/delete_unix_user.py ""

"""

from subprocess import Popen, PIPE
import os, sys

def cmd(args):
    out = Popen(args, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=False)
    e = out.wait()
    stdout = out.stdout.read()
    stderr = out.stderr.read()
    if e:
        sys.stdout.write(stdout)
        sys.stderr.write(stderr)
        sys.exit(e)

def deluser(username):
    # We use the deluser unix command.
    # deluser [options] [--force] [--remove-home] [--remove-all-files]
    home = os.popen("echo ~%s"%username).read().strip()
    cmd(['deluser', '--force', username])
    cmd(['rm', '-rf', home])

if len(sys.argv) != 2:
    sys.stderr.write("Usage: sudo %s <username>"%sys.argv[0])
    sys.stderr.flush()
    sys.exit(1)
else:
    deluser(sys.argv[1])


