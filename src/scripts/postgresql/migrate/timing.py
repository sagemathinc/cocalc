#!/usr/bin/env python
# migrate_times

import os, time

cmd = 'psql %s'%os.environ.get('SMC_DB', 'migrate')

def init():
    s = 'echo "CREATE TABLE IF NOT EXISTS migrate_times (time TIMESTAMP, tbl VARCHAR, op VARCHAR, seconds FLOAT);" | %s'%cmd
    #print s
    if os.system(s):
        raise RuntimeError("error setting up timing table")

def key(table, what):
    return '%s-%s'%(table, what)

start_times ={}
def start(table, what):
    start_times[key(table,what)] = [table, time.time()]

def done(table, what):
    k = key(table, what)
    v = start_times[k]
    t = time.time() - v[1]
    s = 'echo "INSERT INTO migrate_times VALUES(NOW(), \'%s\', \'%s\', %s)" | %s 1>/dev/null 2>/dev/null'%(v[0], what, t, cmd)
    #print s
    if os.system(s):
        raise RuntimeError("error recording timing")

if __name__ == "__main__":
    os.system("echo 'select * from migrate_times order by time desc;' | %s | more"%cmd)
