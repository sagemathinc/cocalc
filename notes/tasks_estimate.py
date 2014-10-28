#!/usr/bin/env python

OPENING = '"desc":"('

import os, sys

if len(sys.argv) > 1:
    file = sys.argv[1]
else:
    file = 'smc.tasks'

if len(sys.argv) > 2:
    tag = "\\#" + sys.argv[2]
else:
    tag = ""


print "file='%s'; tag='%s'"%(file, tag[1:])

tm = 0
for x in os.popen('%s | grep -v done\\":1'%('grep %s %s '%(tag, file) if tag else 'cat %s'%file)).readlines():
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
        try:
            m = int(k[1])
        except:
            print x
            raise
    else:
        m = 0
    tm += 60*h + m

print "-"*70
print "Total: (%s:%s)"%(tm//60,tm%60)

for k in [4,8,9,12,16]:
    print "- %5.1f days at %2s hours/day"%(tm/60./k, k)
