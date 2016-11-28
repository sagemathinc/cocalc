#!/usr/bin/env python

"""
This is a script for starting postgres for development purposes
in an SMC project.
"""

import os, sys, util

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

util.chdir()

ports = util.get_ports()

PG_DATA = os.path.join(path, "postgres_data")

if not os.path.exists(PG_DATA):
    util.cmd("pg_ctl init -D '%s'"%PG_DATA)

# TODO: custom ports
# TODO: setting a random password (?).
util.cmd("postgres  -D '%s'"%PG_DATA)
