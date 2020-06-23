#!/usr/bin/env python
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

import os
import sys


def cmd(s):
    print(s)
    if os.system(s):
        sys.exit(1)


cmd("smc-stop")
cmd("smc-start")
