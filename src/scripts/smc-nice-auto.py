#!/usr/bin/env python
import os, sys

passwd = [x.split(':') for x in open('/etc/passwd').readlines()]

def renice_user(user):
    user = user.rstrip('+')
    v = [x for x in passwd if user in x[2]]
    if len(v) > 1:
        print("user %s does not uniquely determine user"%user)
    elif len(v) == 0:
        print("no such user %s"%user)
    else:
        cmd = "sudo renice -n 19 -u %s"%v[0][0]
        print(cmd)
        os.system(cmd)

if len(sys.argv) > 1:
    n = int(sys.argv[1])
else:
    n = 5

users = {}
for x in os.popen("ps aux | sort -nrk 3,3").readlines():
    v = x.split()
    user = v[0]
    if user not in ['root', 'salvus']:
       users[user] = True
    n -= 1
    if n <= 0:
        break

for user in users.keys():
    renice_user(user)
