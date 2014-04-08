#!/usr/bin/python

import os, shutil, sys

if len(sys.argv) != 3:
    sys.stderr.write("%s src target\n\n   if target doesn't exist, copy src to it and chown target to have permissions of contain dir\n\n"%sys.argv[0])
    sys.exit(1)

_, src, target = sys.argv

if not os.path.exists(target):
    shutil.copyfile(src, target)
    s = os.stat(os.path.split(target)[0])
    os.chown(target, s.st_uid, s.st_gid)

