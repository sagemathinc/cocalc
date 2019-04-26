#!/usr/bin/env python
import os
import sys


def cmd(s):
    print(s)
    if os.system(s):
        sys.exit(1)


cmd("smc-stop")
cmd("smc-start")
