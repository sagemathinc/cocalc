#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.expanduser("~/bin/"))
os.chdir(os.path.join(os.environ['SMC_ROOT'], "smc-build/smc-ansible"))

from smc_rethinkdb import export_accounts, project_host

os.chdir(os.path.expanduser('~/tmp/'))
os.system('bzcat video_chats-compute*.bz2 | bzip2 > video_chats.csv.bz2')

# smc statistics project
host = project_host("7561f68d-3d97-4530-b97e-68af2fb4ed13")

# push to the project via ansible and set the permissions
os.system('ansible %s -m copy -a "src=video_chats.csv.bz2 dest=/projects/7561f68d-3d97-4530-b97e-68af2fb4ed13/video-chats/ owner=1078872008 group=1078872008 mode=u=rw,go=" -become' % host)
