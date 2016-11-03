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



import argparse, os, sys

def forward(vm, port, op):
    cmd = "virsh -c qemu:///session qemu-monitor-command --hmp %s 'hostfwd_%s ::%s-:22'"%(vm, op, port)
    print cmd
    os.system(cmd)


parser = argparse.ArgumentParser(description="Forward or unforward a local port to port 22 on a VM.")
parser.add_argument("machine", help="name of the virtual machine (required)", type=str)
parser.add_argument("--port", dest="port", help="make it so 'ssh localhost -p port' connects to port 22 on the virtual machine (default: 2222)", type=int, default=2222)
parser.add_argument("--remove", help="if given, instead remove", action="store_true")

args = parser.parse_args()

if args.remove:
    op = 'remove'
else:
    op = 'add'

forward(args.machine, args.port, op)

