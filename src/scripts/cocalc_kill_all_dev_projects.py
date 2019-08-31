#!/usr/bin/env python3

import os

pids = ' '.join([x.split()[0] for x in os.popen("ps ax |grep src/smc-project/local_hub.coffee").read().splitlines()])

cmd = "kill -9 %s"%pids
print(cmd)
os.system(cmd)