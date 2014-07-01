#!/usr/bin/env python

OPENING = '"desc":"('

import os, sys

if len(sys.argv) > 1:
    file = sys.argv[1]
else:
    file = 'smc.tasks'

tm = 0
for x in os.popen('grep \#today %s |grep -v done\\":1'%file).readlines():
    i = x.find(OPENING)
    if i == -1:
        continue
    i += len(OPENING)
    j = x.find('?)')
    s = x[i:j]
    print x[:100]
    k = s.split(":")
    h = int(k[0])
    if len(k)>1:
        m = int(k[1])
    else:
        m = 0
    tm += 60*h + m

print "total: (%s:%s?)"%(tm//60,tm%60)
