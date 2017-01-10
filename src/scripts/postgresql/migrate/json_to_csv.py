#!/usr/bin/env python

import os, sys

def process(path_to_json):
    base, ext = os.path.splitext(path_to_json)
    # The grep -v '\\\\u0000' skips any json record with null bytes.  These are not valid/meaningful
    # for postgres, and happen in a very small handful of non-important records.
    path_to_csv = "%s.csv"%base
    s = "time sed 's/,$//' %s | head -n -1 | tail -n +2 | grep -v '\\\\u0000' > %s"%(path_to_json, path_to_csv)
    print(s)
    if os.system(s):
        raise RuntimeError("error converting json to csv - %s"%path_to_json)
    return path_to_csv

if __name__ == "__main__":
    for x in sys.argv[1:]:
        process(x)
