#!/usr/bin/env python

import os, sys

def process(path_to_json):
    base, ext = os.path.splitext(path_to_json)
    # The grep -v '\\\\u0000' skips any json record with null bytes.  These are not valid/meaningful
    # for postgres, and happen in a very small handful of non-important records.
    s = "time sed 's/,$//' %s | head -n -1 | tail -n +2 | grep -v '\\\\u0000' > %s.csv"%(x, base)
    print(s)
    os.system(s)

for x in sys.argv[1:]:
    process(x)
