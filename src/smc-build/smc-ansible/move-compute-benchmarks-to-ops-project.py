#!/usr/bin/env python3
import sys
import os
from glob import glob

# that's working but actually just a hack.
# there should be a script that returns the location of a project.
# then, in an ansible playbook itself, the stdout of this script is used to set a variable,
# which is then used for the ansible copy command below.

sys.path.insert(0, os.path.expanduser("~/bin/"))
os.chdir(os.path.expanduser("~/smc-cluster-mgmt"))

from rethinkdb_smc import projects
host = projects.filter({"project_id": "b97f6266-fe6f-4b40-bd88-9798994a04d1"}).get_field("host").run().next()["host"]

# push to the project via ansible and set the permissions
src = os.path.expanduser("~/tmp/compute-benchmarks/")
os.system('ansible %s -m copy -a "src=%s dest=/projects/b97f6266-fe6f-4b40-bd88-9798994a04d1/benchmarks/ owner=1128707724 group=1128707724 mode=u=rw,go=" -become' % (host, src))

os.system("rm -f accounts.yaml.bz2")
