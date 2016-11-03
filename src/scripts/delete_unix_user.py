#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



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


