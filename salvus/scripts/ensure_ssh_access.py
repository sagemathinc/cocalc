#!/usr/bin/python

import os, sys

path = sys.argv[1]
if not os.path.exists(path):
    raise RuntimeError("no such directory -- %s"%path)

dot_ssh = os.path.join(path, '.ssh')

if os.path.exists(dot_ssh) and not os.path.isdir(dot_ssh):
    os.unlink(dot_ssh)

if not os.path.exists(dot_ssh):
    os.makedirs(dot_ssh)

target = os.path.join(dot_ssh, 'authorized_keys')
authorized_keys = '\n' + open(sys.argv[2]).read() + '\n'

if not os.path.exists(target) or authorized_keys not in open(target).read():
    open(target,'w').write(authorized_keys)

s = os.stat(path)

if os.system('chown -R %s:%s %s'%(s.st_uid, s.st_gid, dot_ssh)):
    raise RuntimeError("failed to chown")

if os.system('chmod og-rwx -R %s'%dot_ssh):
    raise RuntimeError("failed to chmod")
