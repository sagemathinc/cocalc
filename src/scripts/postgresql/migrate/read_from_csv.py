#!/usr/bin/env python

import os, sys

db = os.environ.get('SMC_DB', 'migrate')

for x in sys.argv[1:]:
    base, ext = os.path.splitext(x)
    name = os.path.split(base)[1]
    if name.endswith('-time'):
        name = name[:-5]
    s = """time echo "drop table %s_json; create table %s_json (a JSONB); copy %s_json from '%s' with (format csv, DELIMITER e'\\1', QUOTE e'\\2');" | psql %s """%(name, name, name, os.path.abspath(x), db)
    print(s)
    os.system(s)
