#!/usr/bin/python

import os, sys
from subprocess import Popen, PIPE

progname, username, memory_G, cpu_shares, cfs_quota = sys.argv

if not os.path.exists('/sys/fs/cgroup/memory'):
    raise RuntimeError("cgroups not supported")

def cmd(s, ignore_errors=False):
    print s
    out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=True)
    x = out.stdout.read() + out.stderr.read()
    e = out.wait()  # this must be *after* the out.stdout.read(), etc. above or will hang when output large!
    if e:
        if ignore_errors:
            return (x + "ERROR").strip()
        else:
            raise RuntimeError(x)
    return x.strip()

cmd("cgcreate -g memory,cpu:%s"%username)
open("/sys/fs/cgroup/memory/%s/memory.limit_in_bytes"%username,'w').write("%sG"%memory_G)
open("/sys/fs/cgroup/cpu/%s/cpu.shares"%username,'w').write(cpu_shares)
open("/sys/fs/cgroup/cpu/%s/cpu.cfs_quota_us"%username,'w').write(cfs_quota)

z = "\n%s  cpu,memory  %s\n"%(username, username)
cur = open("/etc/cgrules.conf").read()

if z not in cur:
    open("/etc/cgrules.conf",'a').write(z)
    cmd('service cgred restart')

    try:
        pids = cmd("ps -o pid -u %s"%username, ignore_errors=False).split()[1:]
    except RuntimeError:
        # ps returns an error code if there are NO processes at all (a common condition).
        pids = []
    if pids:
        cmd("cgclassify %s"%(' '.join(pids)), ignore_errors=True)
        # ignore cgclassify errors, since processes come and go, etc.


