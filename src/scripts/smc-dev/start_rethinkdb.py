#!/usr/bin/env python
import os

HERE = os.path.realpath(__file__)
os.chdir(os.path.split(HERE)[0])

def cmd(s):
    print s
    if os.system(s):
        raise RuntimeError

cmd('rethinkdb create -d "rethinkdb_data"')
cmd('rethinkdb serve')


