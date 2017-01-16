#!/usr/bin/env python
import datetime, os, json, sys, timing

# fix timestamps *only* in nested objects, *NOT* at the top level (that's done by sql).

def fix_timestamps(obj, sub=False):
    if isinstance(obj, dict):
        for k, v in obj.iteritems():
            if isinstance(v, dict):
                if sub and "$reql_type$" in v and v["$reql_type$"] == "TIME":
                    obj[k] = datetime.datetime.utcfromtimestamp(v['epoch_time']).isoformat()
                else:
                    fix_timestamps(v, True)
    return obj

def process(file):
    print "fix timestamps in %s"%file
    base = os.path.splitext(file)[0]
    out_filename_csv = base + '-time.csv'
    if os.path.exists(out_filename_csv):
        print("output file %s already exists; not overwriting it"%out_filename_csv)
        return out_filename_csv
    timing.start(os.path.split(base)[-1], 'fix_timestamps')
    out = open(out_filename_csv, 'w')
    for x in open(file).xreadlines():
        out.write(json.dumps(fix_timestamps(json.loads(x[:-1]))) + '\n')
    out.close()
    timing.done(os.path.split(base)[-1], 'fix_timestamps')
    return out_filename_csv

if __name__ == "__main__":
    for file in sys.argv[1:]:
        process(file)