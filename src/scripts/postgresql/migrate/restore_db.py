#!/usr/bin/env python3
import os, sys, datetime, time

st = datetime.datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d-%H%M%S')

if not os.path.exists('/migrate/backups/db/'): os.makedirs('/migrate/backups/db/')

def restore(table):
    v = os.listdir('/migrate/backups/db/')
    if len(v) == 0:
        print("No backups available")
        sys.exit(1)
    v.sort()
    s = "dropdb migrate; time pg_restore -Fc -d  migrate /migrate/backups/db/%s"%(v[-1],)
    print(s)
    os.system(s)

for x in sys.argv[1:]:
    restore(x)
