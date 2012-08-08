#!/usr/bin/env python

import os, sys

if len(sys.argv) == 1:
    print "Usage: %s <number of workers>"%sys.argv[0]
    sys.exit(1)

num_workers = int(sys.argv[1])

def shell(cmd):
    print cmd
    if os.system(cmd):
        print "Error"
        sys.exit(1)

for n in range(1, num_workers+1):
    path = '/home/sagews_worker_%s'%n
    if not os.path.exists(path): 
        shell("useradd -m sagews_worker_%s"%n)
