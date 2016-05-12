#!/usr/bin/env python3
# check, if rethinkdb proxy is alive. If not, restart it.
import sys, os
from os.path import join
import rethinkdb as r
from datetime import datetime

SMC_ROOT = os.environ.get("SMC_ROOT", os.path.expanduser("~/smc/src"))
#HOST=os.environ.get("SMC_DB_HOSTS", "localhost")
HOST="localhost" # testing timeout: "admin1"
AUTH = open(join(SMC_ROOT, 'data/secrets/rethinkdb')).read().strip()
now = datetime.utcnow().isoformat()

def restart_db(err = None):
    print("test failed: restarting")
    os.system('echo "restart at {} - {}" >> ~/.check_rethinkdb_restart.log'\
              .format(now, str(err)))
    # maybe only restart_db
    os.system("restart_db; sleep 1; restart_hub_now")
    sys.exit()

try:
    r.connect(host=HOST, db="smc", auth_key=AUTH, timeout=2).repl()
except r.ReqlTimeoutError as e:
    restart_db(e)
else:
    if "projects" not in r.table_list().run():
        # we also have a problem
        restart_db("projects table not found")
    else:
        print("CHECK OK @ {}".format(now))
