#!/usr/bin/env python
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
