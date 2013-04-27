#!/usr/bin/env python

import json, os, shutil, sys

SALVUS_ROOT = os.environ['SALVUS_ROOT']
BACKUP = os.path.join(SALVUS_ROOT, 'data', 'backup')


if len(sys.argv) != 3:
    sys.stderr.write("Usage: %s <project_id> <location (as json string)>\n"%sys.argv[0])
    sys.stderr.write("""\nFor example:\n\n\trestore_project.py 29ab00c4-09a4-4f2f-a468-19088243d66b '{"username":"cb33df53","host":"localhost"}'\n\n""")
    sys.exit(1)

project_id = sys.argv[1]
print "project_id =", project_id

location = json.loads(sys.argv[2])
if 'path' not in location:
    location['path'] = '.'
if 'port' not in location:
    location['port'] = 22

print "location =", location

def bup(cmd):
    s = "bup "+cmd
    print s
    exit_code = os.system(s)
    print "exit_code =", exit_code
    if exit_code:
        raise RuntimeError

restore_path = os.path.join(BACKUP, 'restore', project_id)

try:
    os.makedirs(restore_path)
    bup("restore --outdir '%s' %s/latest/."%(restore_path, project_id))
    cmd = "rsync -axH '%s/' %s@%s:%s"%(restore_path, location['username'], location['host'], location['path'])
    print cmd
    os.system(cmd)

finally:
    print "Deleting '%s'..."%restore_path
    #shutil.rmtree(restore_path, ignore_errors=True)












