#!/usr/bin/env python
import os

HERE = os.path.split(os.path.abspath(__file__))[0]
os.chdir(HERE)

def cmd(s):
    print s
    if os.system(s):
        raise RuntimeError

if not os.path.exists('rethinkdb_data'):
    cmd('rethinkdb create -d "rethinkdb_data"')
    
cmd('rethinkdb serve')
