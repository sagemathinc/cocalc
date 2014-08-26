#!/usr/bin/env python
import os


home = os.environ['HOME']

for a in os.listdir("%s/.forever"%home):
    if not a.endswith('.log'): continue
    print a
    open(os.path.join(home,'.forever',a),'w')
