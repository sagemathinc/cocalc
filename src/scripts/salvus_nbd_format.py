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



"""
Put this in visudo and make damned sure only root can edit this script.  This only should be in the VM hosts not the actual VM's.

    salvus ALL=(ALL)   NOPASSWD:  /usr/local/bin/salvus_nbd_format.py *
"""

import os, random, sys
from subprocess import Popen, PIPE

if len(sys.argv) != 3:
    print "Usage: %s xfs|ext4|btrfs file.img"%sys.argv[0]
    sys.exit(1) 

format = sys.argv[1]
if format not in ['xfs', 'ext4', 'btrfs']:
    print "format must be xfs or ext4 or btrfs"
    sys.exit(1)

image  = os.path.abspath(sys.argv[2])

if not os.path.exists(image):
    print "image file %s doesn't exist"%image
    sys.exit(1)

def cmd(s):
    print s
    if os.system(s):
        raise RuntimeError('failed: "%s"'%s)

def cmd2(s):
    print s
    if isinstance(s, str):
       out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=True)
    else: 
       out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=False)
    e = out.wait()
    x = out.stdout.read() + out.stderr.read()
    return x,e

max_part = 64
def nbd(n):
    cmd("modprobe nbd max_part=%s"%max_part)
    dev = '/dev/nbd%s'%n 
    if cmd2(['qemu-nbd', '-c', dev, image])[1]:
        raise RuntimeError(out.stdout.read() + out.stderr.read())
    else:
        return dev

def fdisk(dev):
    x,e = cmd2('echo "n\np\n1\n\n\n\nw" | fdisk %s'%dev)
    if "is already defined" in x.lower():
        raise ValueError("already partitioned-- refusing to format.")
    if e:
        raise RuntimeError(x)
 
def mkfs(dev):
    # WARNING: this takes a long time, especially with xfs
    if format == 'xfs':
        cmd("mkfs.%s -f %sp1"%(format, dev))
    else:
        cmd("mkfs.%s %sp1"%(format, dev))
   

def nbd_disconnect(dev):
    cmd("qemu-nbd -d %s"%dev)

dev = None
try:
    for i in range(max_part):
        # we try until success, since nbd is flakie.
        try:
            dev = nbd(i)
            fdisk(dev)
            mkfs(dev)
            break
        except RuntimeError:
            pass
finally:
    if dev is not None:
        nbd_disconnect(dev)


