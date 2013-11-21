#!/usr/bin/env python

import os, sys, time
sys.path.append(os.path.join(os.path.split(os.path.realpath(__file__))[0],'..'))
from admin import run


# 1. Figure out what the newest lxc container is whose name starts with base
prev = [x for x in sorted(run(['lxc-ls']).split()) if x.startswith('base')][-1]
print "Last container:", prev

next = time.strftime("base-%Y-%m-%d-%H%M")

print "New container:", next
run(["lxc-clone", "-s", "-B", "overlayfs", "-o", prev, "-n", next])

print "Now running"
run(["lxc-start", "-d", "-n", next])
time.sleep(1)

while True:
    ip_address = run(["lxc-ls","-1","--fancy", next]).splitlines()[-1].split()[2]
    if ip_address != '-':
        print "IP address:",ip_address
        break
    time.sleep(1)

print "When done:"
print "    sudo lxc-stop -n %s"%next
