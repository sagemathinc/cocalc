#!/usr/bin/env python
import os, sys

passwd = [x.split(':') for x in open('/etc/passwd').readlines()]

def renice_user(user):
    v = [x for x in passwd if user in x[2]]
    if len(v) > 1:
        print("user %s does not uniquely determine user"%user)
    elif len(v) == 0:
        print("no such user %s"%user)
    else:
        cmd = "sudo renice -n 19 -u %s"%v[0][0]
        print(cmd)
        os.system(cmd)

for user in sys.argv[1:]:
    renice_user(user)