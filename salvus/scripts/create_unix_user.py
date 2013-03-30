#!/usr/bin/env python

"""
Create a unix user, setup ssh keys, impose quota, etc.
"""

import os

verbose = True

from subprocess import Popen, PIPE

def cmd(args, dry_run=False, ignore_errors=False):
    if isinstance(args, str):
        shell = True
        if verbose: print args
    else:
        if verbose: print ' '.join(args)
        shell = False
    if dry_run:
        return
    out = Popen(args, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=shell)
    e = out.wait()
    stdout = out.stdout.read()
    stderr =  out.stderr.read()
    if verbose: print stdout,
    if verbose: print stderr,
    if e and not ignore_errors:
        sys.exit(e)
    return {'stdout':stdout, 'stderr':stderr}

username =
cmd(['useradd', '-m', '-U', '-k', 'skel', username])

