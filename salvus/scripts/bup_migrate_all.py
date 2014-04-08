#!/usr/bin/env python

import os, sys

for x in open('/tmp/projects_on_host').readlines():
    project_id = x.strip()
    if os.path.exists('/projects/%s/.zfs/snapshot'%project_id) and not os.path.exists('/tmp/bup/%s'%project_id):
        os.system("./bup_storage.py migrate_all %s"%project_id)