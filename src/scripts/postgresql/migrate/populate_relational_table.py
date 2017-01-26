#!/usr/bin/env python

import os, sys, timing

db = os.environ.get('SMC_DB', 'migrate')

path = os.path.split(os.path.realpath(__file__))[0];

def process(table, replace=False):
    timing.start(table, 'populate_relational_table')
    if replace:
        s = 'echo "DELETE FROM %s;" | psql %s'%(table, db)
        print(s)
        if os.system(s):
            raise RuntimeError("error populating relational data - %s - dropping table failed"%table)
    s = "psql --set ON_ERROR_STOP=1 -d %s -a -f %s/sql/import-%s_json.sql"%(db, path, table)
    print(s)
    if os.system(s):
        raise RuntimeError("error populating relational data - %s"%table)
    timing.done(table, 'populate_relational_table')

if __name__ == "__main__":
    for table in sys.argv[1:]:
        process(table)