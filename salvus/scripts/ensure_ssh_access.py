#!/usr/bin/python

import os, sys

path = sys.argv[1]
if not os.path.exists(path):
    raise RuntimeError("no such directory -- %s"%path)

dot_ssh = os.path.join(path, '.ssh')
os.makedirs(dot_ssh)

target = os.path.join(dot_ssh, 'authorized_keys')

t = open(target).read()
authorized_keys = open(sys.argv[2]).read()
if authorized_keys not in t:
    open(target,'w').write('\n'+authorized_keys)

s = os.stat(path)

if os.system('chown -R %s:%s %s'%(s.uid, s.gid, dot_ssh)):
    raise RuntimeError("failed to chown")

if os.system('chmod og-rwx -R %s'%dot_ssh):
    raise RuntimeError("failed to chmod")
