#!/usr/bin/env python

import os, sys

db = os.environ.get('SMC_DB', 'migrate')

def process(table):
    s = "psql -d %s -a -f sql/import-%s_json.sql"%(db, table)
    print(s)
    if os.system(s):
        raise RuntimeError("error populating relational data - %s"%table)


if __name__ == "__main__":
    for table in sys.argv[1:]:
        process(table)