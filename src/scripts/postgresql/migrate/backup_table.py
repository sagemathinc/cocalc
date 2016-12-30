#!/usr/bin/env python3
import os, sys, datetime, time

st = datetime.datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d-%H%M%S')

def backup(table):
    s = "time pg_dump -Fc --table %s migrate > /migrate/backups/%s-%s.bak"%(table, table, st)
    print(s)
    os.system(s)

for x in sys.argv[1:]:
    backup(x)
