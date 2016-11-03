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



# Suppose there is a BUP repository such that
#
#     bup ls
#
# outputs
#
#     error: refs/heads/master does not point to a valid object!
#
# This script -- when run inside the BUP repo -- will point refs/heads/master
# to the previous commit, which should fix this problem.
# If bup ls doesn't yield an error, this script won't change anything.
# The entire point of this script is to fix some past snapshot repos that
# have this problem, probably due to a bug in the rollback functionality
# of snap.coffee.


import os, sys

def cmd(s):
    print s
    t = os.popen3(s)
    return t[1].read() + t[2].read()

def fix(path):
    print "Checking '%s'"%path
    os.environ['BUP_DIR'] = path
    os.chdir(path)

    # Check to see if the repo is working
    def repo_is_working():
        c = cmd("bup ls")
        if 'error: refs/heads/master does not point to a valid object!' in c:
            return False
        if 'is far too short to be a pack' in c:
            return False
        return True

    # Move the head back up to 3 times, which should be enough to fix the repo.
    def move_head_back():
        print "Moving head back"
        if os.path.exists('logs/HEAD'):
            log = open('logs/HEAD').readlines()
            print "log exists and has length %s"%(len(log))
            i = -1
            while not repo_is_working() and i >= -20 and abs(i) <= len(log):
                print "Trying head %s"%i
                previous_head = log[i].split()[0]
                open('refs/heads/master','w').write(previous_head)
                i -= 1
        else:
            print "Repo cannot be fixed -- very likely that there are no valid commits at all."
            # Hard case -- no logs/H

    if not repo_is_working():
        print "repo %s is broken"%os.environ['BUP_DIR']
        move_head_back()
        if repo_is_working():
            print "repo is now fixed!"
        else:
            print "repo is STILL broken"
    else:
        print "repo %s is fine"%os.environ['BUP_DIR']

paths = [os.path.abspath(x) for x in sys.argv[1:] if os.path.isdir(x)]
for path in paths:
    fix(path)

