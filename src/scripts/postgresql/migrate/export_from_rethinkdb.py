#!/usr/bin/env python
import os, timing

def process(table, export=True, update=False):
    out = '/migrate/data/%s'%table
    if update:
        path_to_json = out + '/smc/update-%s.json'%table
        if not os.path.exists(path_to_json):
            raise RuntimeError("run the update query")
            return path_to_json
    else:
        path_to_json = out + '/smc/%s.json'%table
    if not os.path.exists(out):
        export = True
    if not export:
        return path_to_json
    timing.start(table, 'export_from_rethinkdb')
    if os.path.exists(out):
        os.system("rm -rf %s"%out)
    if table == 'accounts':
        s = "cd /migrate/smc/src&& . smc-env&& cd /migrate/smc/src/scripts/postgresql/migrate/&&time coffee repeated_emails.coffee"
        print s
        if os.system(s):
            raise RuntimeError("error deduplicating emails")
    s = "time rethinkdb export --password-file /migrate/secrets/rethinkdb --format json  -d %s -c db3 -e smc.%s"%(
        out, table)
    print s
    if os.system(s):
        raise RuntimeError("error exporting from rethinkdb - %s"%table)
    timing.done(table, 'export_from_rethinkdb')
    return path_to_json

if __name__ == "__main__":
    for file in sys.argv[1:]:
        process(file)