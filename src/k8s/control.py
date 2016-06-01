#!/usr/bin/env python3

import os, sys
join = os.path.join

SCRIPT_PATH = os.path.split(os.path.realpath(__file__))[0]
os.chdir(SCRIPT_PATH)
sys.path.insert(0, os.path.abspath(os.path.join(SCRIPT_PATH, 'util')))
import util

if __name__ == '__main__':
    if len(sys.argv) == 1 or not os.path.exists(sys.argv[1]):
        print("usage: %s [cluster|haproxy|rethinkdb|rethinkdb-proxy|smc-hub|smc-project|smc-webapp-static] ..."%sys.argv[0])
        sys.exit(1)
    os.chdir(sys.argv[1])
    util.run(['./control.py'] + sys.argv[2:])
