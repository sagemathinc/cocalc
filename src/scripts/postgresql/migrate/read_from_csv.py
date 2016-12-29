#!/usr/bin/env python

import os, sys

for x in sys.argv[1:]:
    base, ext = os.path.splitext(x)
    name = os.path.split(base)[1]
    s = """echo "drop table %s_json; create table %s_json (a JSONB); copy %s_json from '%s' with (format csv, DELIMITER e'\\1', QUOTE e'\\2');" | psql migrate """%(name, name, name, os.path.abspath(x))
    print(s)
    os.system(s)