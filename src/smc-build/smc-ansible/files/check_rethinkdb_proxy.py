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

PATH = "$HOME/bin:$HOME/smc/src:$HOME/smc/src/smc-hub/scripts:$HOME/smc/src/scripts/storage:$HOME/smc/src/scripts/gce:$HOME/smc/src/scripts/hub:$HOME/smc/src/node_modules/.bin/:$HOME/smc/src/data/local/bin:$HOME/smc/src/data/local/sbin:$HOME/smc/src/scripts:$HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

def restart_db(err = None):
    print("test failed: restarting")
    os.system('echo "restart at {} - {}" >> ~/.check_rethinkdb_restart.log'\
              .format(now, str(err)))
    os.system("export PATH=\"%s\"; . $HOME/.conf; restart_db; restart_hub_now" % PATH)
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
