#!/usr/bin/env python3
# this copies over all files in admin0:~/stripe/ to the ~/stripe folder in the statistics project
import sys
import os
sys.path.insert(0, os.path.expanduser("~/bin/"))
os.chdir(os.path.join(os.environ['SMC_ROOT'], "smc-build/smc-ansible"))

# host of statistics project
from smc_rethinkdb import project_host
host = project_host("7561f68d-3d97-4530-b97e-68af2fb4ed13")

src = os.path.expanduser("~/stripe/")

# push to the project via ansible and set the permissions
os.system('ansible %s -m copy -a "src=%s dest=/projects/7561f68d-3d97-4530-b97e-68af2fb4ed13/stripe/ owner=1078872008 group=1078872008 mode=u=rw,go=" -become' % (host, src))



