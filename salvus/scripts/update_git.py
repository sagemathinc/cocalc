#!/usr/bin/env python

import hosts, os

for hostname in hosts.hosts:
    # the u below means that this won't overwrite newer files on destination, which could happen by accident if we were careless.
    cmd = 'ssh %s "cd salvus; git pull origin master"'%hostname
    print cmd
    os.system(cmd)
