#!/usr/bin/env python
import os, timing

def process(table):
    timing.start(table, 'export_from_rethinkdb')
    out = '/migrate/data/%s'%table
    if os.path.exists(out):
        os.system("rm -rf %s"%out)
    s = "time rethinkdb export --password-file /migrate/secrets/rethinkdb --format json  -d %s -c db3 -e smc.%s"%(
        out, table)
    print s
    if os.system(s):
        raise RuntimeError("error exporting from rethinkdb - %s"%table)
    timing.done(table, 'export_from_rethinkdb')
    return out + '/smc/%s.json'%table

if __name__ == "__main__":
    for file in sys.argv[1:]:
        process(file)