#!/usr/bin/env python3
import os, sys, datetime, time

st = datetime.datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d-%H%M%S')

if not os.path.exists('/migrate/backups/db/'): os.makedirs('/migrate/backups/db/')

def backup():
    s = "time pg_dump -Fc migrate > /migrate/backups/db/%s.bak"%(st, )
    print(s)
    os.system(s)

backup()
