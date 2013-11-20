#!/usr/bin/env python

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
        return 'error: refs/heads/master does not point to a valid object!' not in cmd("bup ls")

    # Move the head back up to 3 times, which should be enough to fix the repo.
    def move_head_back():
        if os.path.exists('logs/HEAD'):
            log = open('logs/HEAD').readlines()
            i = -1
            while not repo_is_working() and i >= -3 and abs(i) >= len(log):
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

