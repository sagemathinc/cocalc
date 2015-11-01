#!/usr/bin/env python
import os

HERE = os.path.abspath(__file__)
os.chdir(os.path.split(HERE)[0])

def cmd(s):
    print s
    if os.system(s):
        raise RuntimeError

if not os.path.exists('rethinkdb_data'):
    cmd('rethinkdb create -d "rethinkdb_data"')
    
cmd('rethinkdb serve')
