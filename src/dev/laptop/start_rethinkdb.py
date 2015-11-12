#!/usr/bin/env python
import os, util

util.chdir()

if not os.path.exists('rethinkdb_data'):
    util.cmd('rethinkdb create -d "rethinkdb_data"')

util.cmd('rethinkdb serve')
