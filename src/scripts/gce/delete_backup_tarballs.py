#!/usr/bin/env python

"""
Delete all the .tar.lz4 files from the /backups/project-id/ directories.

This is not a simple rm */*.tar.lz4, since there are way too many directories, and rm will die.

"""

import os, time

print("Getting directory listing...")
projects = os.listdir('/backups')
print("Got %s directories" % len(projects))

t = time.time()
i = 0
for project_id in projects:
    path = '/backups/%s'%project_id
    i += 1
    eta = ((time.time() - t)/i * (len(projects)-i))/60
    print("%s/%s: %s (%s minutes left)" % (i, len(projects), path, eta))
    for X in os.listdir(path):
        if X.endswith('.tar.lz4'):
            os.unlink(path+'/'+X)
