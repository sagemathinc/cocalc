#!/usr/bin/env python3
# this copies over all files in admin0:~/stripe/ to the ~/stripe folder in the statistics project
print("setup")
import sys
import os
from os.path import join, expanduser, relpath, normpath

# Id of the smc statistics project
project_id = '7561f68d-3d97-4530-b97e-68af2fb4ed13'

sys.path.insert(0, expanduser("~/bin/"))
os.chdir(os.path.join(os.environ['SMC_ROOT'], "smc-build/smc-ansible"))

# host of statistics project
print("get host")
from smc_rethinkdb import project_host
host = project_host(project_id)
print("host = ", host)

db_logs = expanduser("~/db-logs/")

# push to the project via ansible and set the permissions
print("run ansible")

from glob import glob

for root, dirs, files in os.walk(db_logs):
    for fn in files:
        fn = join(relpath(root, db_logs), fn)
        dest = normpath(join('/projects/%s/db-logs/' % project_id, fn))
        src = normpath(join(db_logs, fn))
        print('src=%s' % src)
        print('dest=%s' % dest)
        os.system('ansible {host} -m copy -a "src={src} dest={dest} owner=1078872008 group=1078872008 mode=u=rw,go=" -become'.format(**locals()))
        print()



