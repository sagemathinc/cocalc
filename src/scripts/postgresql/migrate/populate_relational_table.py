#!/usr/bin/env python

import os, sys, timing

db = os.environ.get('SMC_DB', 'migrate')

def process(table):
    timing.start(table, 'populate_relational_table')
    s = "psql --set ON_ERROR_STOP=1 -d %s -a -f sql/import-%s_json.sql"%(db, table)
    print(s)
    if os.system(s):
        raise RuntimeError("error populating relational data - %s"%table)
    timing.done(table, 'populate_relational_table')

if __name__ == "__main__":
    for table in sys.argv[1:]:
        process(table)