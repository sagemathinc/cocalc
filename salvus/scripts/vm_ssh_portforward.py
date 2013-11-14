#!/usr/bin/env python

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

