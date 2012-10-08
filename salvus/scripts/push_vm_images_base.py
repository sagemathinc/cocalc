#!/usr/bin/env python

import hosts, os

BASE = '~/vm/images/base/'

for hostname in hosts.vm_hosts:
    # the u below means that this won't overwrite newer files on destination, which could happen by accident if we were careless.
    cmd = "rsync --sparse -uaxvH %s %s:vm/images/base/ &"%(BASE, hostname)
    print cmd
    os.system(cmd)
