#!/usr/bin/env python
import os


home = os.environ['HOME']

for a in os.listdir("%s/.forever"%home):
    print a
    open(os.path.join(home,a),'w').close() 
