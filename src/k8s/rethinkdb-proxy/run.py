#!/usr/bin/env python3
import os
from subprocess import call

LOG = '/home/rethinkdb/rethinkdb.log'

v = ['rethinkdb', 'proxy', '--daemon', '--bind', 'all', '--no-http-admin', '--no-update-check', '--log-file', LOG]

if 'JOIN' in os.environ:
    v.append('--join')
    v.append(os.environ['JOIN'])

if 'INITIAL_PASSWORD' in os.environ:
    # NOTE: The database we join *must* have a password, or "--initial-password auto" will break.
    v.append('--initial-password')
    v.append('auto')

call(v)

call(['tail', '-f', LOG])
