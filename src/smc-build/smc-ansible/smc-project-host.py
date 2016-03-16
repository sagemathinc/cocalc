#!/usr/bin/env python3
import sys
import os

# return the host of a given project

sys.path.insert(0, os.path.expanduser("~/bin/"))
os.chdir(os.path.expanduser("~/smc-cluster-mgmt"))

from rethinkdb_smc import projects
print(projects.filter({"project_id": sys.argv[1]}).get_field("host").run().next()["host"])