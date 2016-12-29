#!/usr/bin/env python

import os, sys

for x in sys.argv[1:]:
    base, ext = os.path.splitext(x)
    s = "time sed 's/,$//' %s | head -n -1 | tail -n +2 > %s.csv"%(x, base)
    print(s)
    os.system(s)