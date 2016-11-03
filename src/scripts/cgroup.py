#!/usr/bin/python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



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


