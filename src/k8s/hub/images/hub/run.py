#!/usr/bin/env python

import time, os

os.system("service ssh start&")
os.system("cd /smc/src; source ./smc-env; ./go&")

while True:
    print("sleeping...")
    time.sleep(30)

