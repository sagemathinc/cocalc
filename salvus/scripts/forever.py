#!/usr/bin/env python

# Ensure that system-wide daemons stays running.
# If <service> is not running, do "service <service> restart".
# We do NOT just do "service <service> start" since that does
# not work (it's just an observerable fact).

import os, sys, time

SERVICES = sys.argv[1:]
if len(SERVICES) == 0 or len([x for x in SERVICES if x.startswith('-')]):
    sys.stderr.write("usage: %s <service> <service> ...\n"%sys.argv[0])
    sys.exit(1)

def is_running(service):
    return bool(os.popen("pidof %s"%service).read())

def test(service):
    if not is_running(service):
        print("%s: %s not running so restarting"%(service, time.asctime()))
        os.system("sudo service %s restart"%service)
        time.sleep(15)  # wait extra time for service to start up

while True:
    for service in SERVICES:
        test(service)
    time.sleep(15)

