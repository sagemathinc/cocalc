#!/usr/bin/env python3
import os, sys, datetime, time

st = datetime.datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d-%H%M%S')

if not os.path.exists('/migrate/backups/tables/'): os.makedirs('/migrate/backups/tables/')

def backup(table):
    s = "time pg_dump -Fc --table %s migrate > /migrate/backups/tables/%s-%s.bak"%(table, table, st)
    print(s)
    os.system(s)

for x in sys.argv[1:]:
    backup(x)
