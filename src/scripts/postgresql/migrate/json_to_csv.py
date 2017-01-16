#!/usr/bin/env python

import os, sys, timing

def process(path_to_json, do_it=True):
    base, ext = os.path.splitext(path_to_json)
    # The grep -v '\\\\u0000' skips any json record with null bytes.  These are not valid/meaningful
    # for postgres, and happen in a very small handful of non-important records.
    path_to_csv = "%s.csv"%base
    if not os.path.exists(path_to_csv):
        do_it = True
    if not do_it:
        return path_to_csv
    timing.start(os.path.split(base)[-1], 'json_to_csv')
    s = "time sed 's/,$//' %s | head -n -1 | tail -n +2 | grep -v '\\\\u0000' > %s"%(path_to_json, path_to_csv)
    print(s)
    if os.system(s):
        raise RuntimeError("error converting json to csv - %s"%path_to_json)
    timing.done(os.path.split(base)[-1], 'json_to_csv')
    return path_to_csv

if __name__ == "__main__":
    for x in sys.argv[1:]:
        process(x)
