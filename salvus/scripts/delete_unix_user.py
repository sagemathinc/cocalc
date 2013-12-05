#!/usr/bin/env python

"""
Complete delete a given unix user

You should put the following in visudo:

            salvus ALL=(ALL)   NOPASSWD:  /usr/local/bin/create_unix_user.py ""
            salvus ALL=(ALL)   NOPASSWD:  /usr/local/bin/delete_unix_user.py *
"""

from subprocess import Popen, PIPE
import os, sys

def cmd(args, exit_on_error=True):
    print ' '.join(args)
    out = Popen(args, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=False)
    e = out.wait()
    stdout = out.stdout.read()
    stderr = out.stderr.read()
    if e:
        print "ERROR --", e
        sys.stdout.write(stdout)
        sys.stderr.write(stderr)
        sys.stdout.flush(); sys.stderr.flush()
        if exit_on_error:
           sys.exit(e)


def deluser(username):
    if len(username) != 8:
         sys.stderr.write("Suspicious username '%s' doesn't have length -- refusing to delete!\n"%username)
         sys.exit(1)
    else:
         # We use the deluser unix command.
         # deluser [options] [--force] [--remove-home] [--remove-all-files]
         home = os.popen("echo ~%s"%username).read().strip()
         cmd(['killall', '-9', '-u', username], exit_on_error=False)
         cmd(['deluser', '--force', username], exit_on_error=True)
         cmd(['rm', '-rf', home], exit_on_error=False)

if len(sys.argv) != 2:
    sys.stderr.write("Usage: sudo %s <username>\n"%sys.argv[0])
    sys.stderr.flush()
    sys.exit(1)
else:
    deluser(sys.argv[1])


