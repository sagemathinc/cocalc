#!/usr/bin/env python3
import os, sys, datetime, time

st = datetime.datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d-%H%M%S')

def restore(table):
    v = [x for x in os.listdir('/migrate/backups') if x.startswith(table+'-')]
    if len(v) == 0:
        print("No backups available for '%s'"%table)
        sys.exit(1)
    v.sort()
    s = "time pg_restore -Fc --table %s  -d  migrate /migrate/backups/%s"%(table, v[-1])
    print(s)
    os.system(s)

for x in sys.argv[1:]:
    restore(x)
