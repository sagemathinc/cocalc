#!/usr/bin/env python

import os, sys

for project_id in open(sys.argv[1]).readlines():
    if os.path.exists('/projects/%s/.zfs/snapshot'%project_id) and not os.path.exists('/tmp/bup/%s'%project_id):
        os.system("./bup_storage.py migrate %s"%project_id)