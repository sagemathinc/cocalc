#!/usr/bin/env python3
from subprocess import call

call(['rethinkdb', '--bind', 'all', '--no-http-admin'])
