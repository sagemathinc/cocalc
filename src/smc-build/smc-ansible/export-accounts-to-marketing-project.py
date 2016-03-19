#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.expanduser("~/bin/"))
os.chdir(os.path.expanduser("~/smc-cluster-mgmt"))

from smc_rethinkdb import export_accounts, project_host
export_accounts("accounts.yaml.bz2")

host = project_host("92848d19-8432-46c8-ba59-2b0d9521c9f2")

# push to the project via ansible and set the permissions
os.system('ansible %s -m copy -a "src=accounts.yaml.bz2 dest=/projects/92848d19-8432-46c8-ba59-2b0d9521c9f2/marketing/cold-emails/ owner=751223180 group=751223180 mode=u=rw,go=" -become' % host)

os.system("rm -f accounts.yaml.bz2")

