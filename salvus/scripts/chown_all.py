#!/usr/bin/env python

# Run bup_storage.py chown <project_id> for all projects on this host, with a little delay between
# each to not monopolize io
import time, os

delay = 0.25

print "Getting list of all projects"
v = os.listdir('/projects')
print "Got %s projects"%len(v)

for project_id in sorted(v):
    c = "bup_storage.py chown %s"%project_id
    print c
    os.system(c)
    time.sleep(delay)