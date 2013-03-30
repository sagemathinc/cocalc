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
        sys.exit(e)
    return {'stdout':stdout, 'stderr':stderr}

n = 0
username = 'sage%s'%n
while os.path.exists('/home/%s'%username):
    n += 1
    username = 'sage%s'%n

out = cmd(['useradd', '-m', '-U', '-k', 'skel', username])

print username
