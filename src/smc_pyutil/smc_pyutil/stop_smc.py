#!/usr/bin/env python3

import os
import sys

if not 'SMC' in os.environ:
    os.environ['SMC'] = os.path.join(os.environ['HOME'], '.smc')
SMC = os.environ['SMC']


def cmd(s):
    print(s)
    if os.system(s):
        sys.exit(1)


def remove_port_files():
    print("Remove port files.")
    for x in os.listdir(SMC):
        p = os.path.join(SMC, x)
        if os.path.isdir(p):
            for y in os.listdir(p):
                if y.endswith('.port'):
                    os.unlink(os.path.join(p, y))


def stop_daemons():
    print("stop daemons")
    cmd("smc-local-hub stop")
    cmd("smc-console-server stop")
    cmd("smc-sage-server stop")


def main():
    remove_port_files()
    stop_daemons()


if __name__ == "__main__":
    main()
